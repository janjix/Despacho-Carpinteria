-- =====================================================================
-- Parche 02 · camiones, viajes y anulación de escaneos
--
-- Ejecutar sobre una base que ya tiene migracion.sql corriendo.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Dos entidades separadas a propósito:
--   camiones  el vehículo. Existe entre viaje y viaje.
--   viajes    una carga concreta, con su fecha y su contenido.
--
-- Un camión hace muchos viajes, y un viaje puede llevar bultos de más de un
-- proyecto. Guardar el camión directo en el ítem habría perdido el "contuvo":
-- al segundo viaje ya no se sabría qué llevó el primero.
-- =====================================================================

create table if not exists camiones (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null,
  nombre     text,
  placa      text,
  conductor  text,
  telefono   text,
  capacidad  text,
  notas      text,
  activo     boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists camiones_codigo_uidx
  on camiones (upper(codigo)) where deleted_at is null;

create sequence if not exists viajes_seq;

create table if not exists viajes (
  id          uuid primary key default gen_random_uuid(),
  camion_id   uuid not null references camiones(id) on delete cascade,
  codigo      text not null unique,
  destino     text,
  estado      text not null default 'cargando'
              check (estado in ('cargando','despachado','entregado','anulado')),
  salida_at   timestamptz,
  entrega_at  timestamptz,
  notas       text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists viajes_camion_idx on viajes (camion_id) where deleted_at is null;
create index if not exists viajes_estado_idx on viajes (estado)    where deleted_at is null;

-- El ítem recuerda en qué viaje subió
alter table items add column if not exists viaje_id uuid references viajes(id) on delete set null;
create index if not exists items_viaje_idx on items (viaje_id) where deleted_at is null;

-- Vocabulario nuevo en la bitácora
alter table escaneos drop constraint if exists escaneos_accion_check;
alter table escaneos add constraint escaneos_accion_check
  check (accion in ('embalaje','carga','reversion','anulacion'));

alter table escaneos drop constraint if exists escaneos_resultado_check;
alter table escaneos add constraint escaneos_resultado_check
  check (resultado in ('ok','duplicado','fuera_de_orden','no_encontrado','sin_viaje'));

alter table escaneos add column if not exists viaje_id uuid references viajes(id) on delete set null;

-- ---------------------------------------------------------------------
-- Código de viaje: V-AAMMDD-NNN, correlativo global
-- ---------------------------------------------------------------------

create or replace function siguiente_codigo_viaje()
returns text
language sql
as $$
  select 'V-' ||
         to_char(timezone('America/Caracas', now()), 'YYMMDD') || '-' ||
         lpad(nextval('viajes_seq')::text, 3, '0');
$$;

-- ---------------------------------------------------------------------
-- Escaneo con viaje
--
-- En modo carga el viaje es obligatorio. Sin él no se sabría en qué camión
-- subió el bulto, que es justo lo que este parche viene a resolver.
-- ---------------------------------------------------------------------

-- La versión de dos argumentos tiene que irse: con la nueva de tres y su
-- valor por defecto, Postgres no puede elegir entre las dos y falla toda
-- llamada de dos argumentos con "function is not unique".
drop function if exists escanear(text, text);

create or replace function escanear(p_codigo text, p_modo text, p_viaje uuid default null)
returns jsonb
language plpgsql
as $$
declare
  v_item      items%rowtype;
  v_plano     text := upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  v_resultado text;
  v_estado    text;
begin
  if p_modo not in ('embalaje','carga') then
    raise exception 'Modo inválido: %', p_modo;
  end if;

  if p_modo = 'carga' then
    if p_viaje is null then
      insert into escaneos (codigo, accion, resultado, detalle)
      values (upper(trim(p_codigo)), p_modo, 'sin_viaje', 'no había viaje seleccionado');
      return jsonb_build_object('resultado','sin_viaje','codigo',upper(trim(p_codigo)));
    end if;

    select estado into v_estado from viajes where id = p_viaje and deleted_at is null;
    if v_estado is null or v_estado not in ('cargando','despachado') then
      insert into escaneos (codigo, accion, resultado, detalle, viaje_id)
      values (upper(trim(p_codigo)), p_modo, 'sin_viaje', 'el viaje no admite carga', p_viaje);
      return jsonb_build_object('resultado','sin_viaje','codigo',upper(trim(p_codigo)));
    end if;
  end if;

  select * into v_item
    from items
   where codigo_plano = v_plano and deleted_at is null
     for update;

  if not found then
    insert into escaneos (codigo, accion, resultado, viaje_id)
    values (v_plano, p_modo, 'no_encontrado', p_viaje);
    return jsonb_build_object('resultado','no_encontrado','codigo',v_plano);
  end if;

  if p_modo = 'embalaje' then
    if v_item.estado = 'pendiente' then
      update items set estado = 'embalado', embalado_at = now()
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
    else
      v_resultado := 'duplicado';
    end if;
  else
    if v_item.estado = 'embalado' then
      update items
         set estado = 'cargado', cargado_at = now(), viaje_id = p_viaje
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
    elsif v_item.estado = 'cargado' then
      v_resultado := 'duplicado';
    else
      v_resultado := 'fuera_de_orden';
    end if;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado, viaje_id)
  values (v_item.codigo, v_item.id, p_modo, v_resultado, p_viaje);

  return jsonb_build_object('resultado', v_resultado, 'item', to_jsonb(v_item));
end;
$$;

-- ---------------------------------------------------------------------
-- Anular un escaneo
--
-- Distinto de una corrección silenciosa: la anulación exige motivo y queda
-- en la bitácora. El estado anterior no se borra del historial, se contradice.
--
-- p_todo = false  retrocede un paso (cargado → embalado)
-- p_todo = true   deja el ítem en pendiente
-- ---------------------------------------------------------------------

create or replace function anular_escaneo(
  p_item uuid,
  p_motivo text default null,
  p_todo boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_item   items%rowtype;
  v_previo text;
begin
  select * into v_item from items where id = p_item and deleted_at is null for update;
  if not found then
    return jsonb_build_object('resultado','no_encontrado');
  end if;

  v_previo := v_item.estado;

  if v_item.estado = 'pendiente' then
    return jsonb_build_object('resultado','duplicado','item',to_jsonb(v_item));
  end if;

  if p_todo or v_item.estado = 'embalado' then
    update items
       set estado = 'pendiente', embalado_at = null, cargado_at = null, viaje_id = null
     where id = p_item returning * into v_item;
  else
    update items
       set estado = 'embalado', cargado_at = null, viaje_id = null
     where id = p_item returning * into v_item;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado, detalle)
  values (
    v_item.codigo, v_item.id, 'anulacion', 'ok',
    coalesce(nullif(trim(p_motivo), ''), 'sin motivo') || ' · venía de ' || v_previo
  );

  return jsonb_build_object('resultado','ok','item',to_jsonb(v_item),'previo',v_previo);
end;
$$;

-- Se mantiene revertir_item por compatibilidad, delegando en la anulación
drop function if exists revertir_item(uuid);

create or replace function revertir_item(p_item uuid)
returns jsonb
language sql
as $$
  select anular_escaneo(p_item, 'reversión manual', false);
$$;

-- ---------------------------------------------------------------------
-- Qué lleva o llevó cada viaje
-- ---------------------------------------------------------------------

create or replace view viaje_contenido as
select
  v.id                as viaje_id,
  v.codigo            as viaje_codigo,
  v.estado            as viaje_estado,
  v.salida_at,
  c.id                as camion_id,
  c.codigo            as camion_codigo,
  c.placa,
  p.id                as proyecto_id,
  p.nombre            as proyecto,
  p.cliente,
  a.nombre            as area,
  i.id                as item_id,
  i.codigo            as item_codigo,
  i.nombre            as item,
  i.medidas,
  i.material,
  i.indice,
  i.cantidad,
  i.cargado_at
from viajes v
join camiones c on c.id = v.camion_id
left join items i on i.viaje_id = v.id and i.deleted_at is null
left join areas a on a.id = i.area_id
left join proyectos p on p.id = a.proyecto_id
where v.deleted_at is null;

-- Resumen por viaje, para las listas
create or replace view viaje_resumen as
select
  v.id,
  v.codigo,
  v.estado,
  v.destino,
  v.salida_at,
  v.entrega_at,
  v.created_at,
  c.id     as camion_id,
  c.codigo as camion_codigo,
  c.placa,
  c.conductor,
  count(i.id)                            as bultos,
  count(distinct a.proyecto_id)          as proyectos,
  min(i.cargado_at)                      as primer_escaneo,
  max(i.cargado_at)                      as ultimo_escaneo
from viajes v
join camiones c on c.id = v.camion_id
left join items i on i.viaje_id = v.id and i.deleted_at is null
left join areas a on a.id = i.area_id
where v.deleted_at is null
group by v.id, c.id;

-- ---------------------------------------------------------------------
-- RLS y realtime para las tablas nuevas
-- ---------------------------------------------------------------------

alter table camiones enable row level security;
alter table viajes   enable row level security;

drop policy if exists p_camiones on camiones;
drop policy if exists p_viajes   on viajes;
create policy p_camiones on camiones for all using (true) with check (true);
create policy p_viajes   on viajes   for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table viajes;
exception when duplicate_object then null;
end $$;
