-- =====================================================================
-- TECC Despacho — migración inicial
-- Ejecutar completo en el SQL Editor de Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists proyectos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  cliente        text,
  codigo_corto   text not null,              -- va dentro del código de barras
  fecha_despacho date,
  estado         text not null default 'activo'
                 check (estado in ('activo','despachado','archivado')),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists areas (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references proyectos(id) on delete cascade,
  nombre       text not null,
  codigo_corto text not null,
  orden        int  not null default 0,
  -- contador nunca decrece: los números borrados no se reutilizan
  contador     int  not null default 0,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Un registro por etiqueta física.
-- Si el usuario carga "Puerta corrediza" con cantidad 3, se crean tres filas
-- que comparten grupo_id y se diferencian por indice (1, 2, 3).
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references areas(id) on delete cascade,
  grupo_id      uuid not null default gen_random_uuid(),
  codigo        text not null unique,
  -- Versión sin guiones para comparar contra lo que manda el lector.
  -- Ver la nota sobre distribución de teclado en el README.
  codigo_plano  text generated always as
                (upper(regexp_replace(codigo, '[^A-Za-z0-9]', '', 'g'))) stored,
  nombre        text not null,
  descripcion   text,
  medidas       text,
  material      text,
  cantidad      int  not null default 1,     -- total del grupo
  indice        int  not null default 1,     -- posición dentro del grupo
  notas         text,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','embalado','cargado')),
  embalado_at   timestamptz,
  cargado_at    timestamptz,
  impresa_at    timestamptz,                 -- última vez que se imprimió
  desactualizada boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- Bitácora de auditoría. Registra también los escaneos rechazados.
create table if not exists escaneos (
  id         bigserial primary key,
  codigo     text not null,
  item_id    uuid references items(id) on delete set null,
  accion     text not null check (accion in ('embalaje','carga','reversion')),
  resultado  text not null
             check (resultado in ('ok','duplicado','fuera_de_orden','no_encontrado')),
  detalle    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

create unique index if not exists items_codigo_uidx  on items (codigo);
create unique index if not exists items_plano_uidx     on items (codigo_plano);
create index if not exists items_area_idx            on items (area_id) where deleted_at is null;
create index if not exists items_estado_idx          on items (estado)  where deleted_at is null;
create index if not exists items_grupo_idx           on items (grupo_id);
create index if not exists areas_proyecto_idx        on areas (proyecto_id) where deleted_at is null;
create index if not exists escaneos_creado_idx       on escaneos (created_at desc);

-- ---------------------------------------------------------------------
-- Correlativo por área
-- Reserva un bloque de n números de forma atómica y devuelve el primero.
-- ---------------------------------------------------------------------

create or replace function reservar_correlativo(p_area uuid, p_cantidad int)
returns int
language plpgsql
as $$
declare
  v_inicio int;
begin
  update areas
     set contador = contador + p_cantidad
   where id = p_area
  returning contador - p_cantidad + 1 into v_inicio;

  if v_inicio is null then
    raise exception 'Área % no existe', p_area;
  end if;

  return v_inicio;
end;
$$;

-- ---------------------------------------------------------------------
-- Escaneo atómico
-- Resuelve la transición y escribe la bitácora en una sola transacción,
-- con bloqueo de fila. Dos lectores no pueden pisar el mismo ítem.
-- ---------------------------------------------------------------------

create or replace function escanear(p_codigo text, p_modo text)
returns jsonb
language plpgsql
as $$
declare
  v_item      items%rowtype;
  v_codigo    text := upper(trim(p_codigo));
  -- Aceptamos las dos formas: con guiones si se tecleó a mano, sin guiones
  -- si vino del lector o de la cámara.
  v_plano     text := upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  v_resultado text;
begin
  if p_modo not in ('embalaje','carga') then
    raise exception 'Modo inválido: %', p_modo;
  end if;

  select * into v_item
    from items
   where codigo_plano = v_plano and deleted_at is null
     for update;

  if not found then
    insert into escaneos (codigo, accion, resultado)
    values (v_codigo, p_modo, 'no_encontrado');
    return jsonb_build_object('resultado','no_encontrado','codigo',v_codigo);
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
      update items set estado = 'cargado', cargado_at = now()
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
    elsif v_item.estado = 'cargado' then
      v_resultado := 'duplicado';
    else
      v_resultado := 'fuera_de_orden';
    end if;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado)
  values (v_item.codigo, v_item.id, p_modo, v_resultado);

  return jsonb_build_object(
    'resultado', v_resultado,
    'item', to_jsonb(v_item)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Reversión manual de estado
-- ---------------------------------------------------------------------

create or replace function revertir_item(p_item uuid)
returns jsonb
language plpgsql
as $$
declare
  v_item items%rowtype;
begin
  select * into v_item from items where id = p_item for update;
  if not found then
    return jsonb_build_object('resultado','no_encontrado');
  end if;

  if v_item.estado = 'cargado' then
    update items set estado = 'embalado', cargado_at = null
     where id = p_item returning * into v_item;
  elsif v_item.estado = 'embalado' then
    update items set estado = 'pendiente', embalado_at = null
     where id = p_item returning * into v_item;
  else
    return jsonb_build_object('resultado','duplicado','item',to_jsonb(v_item));
  end if;

  insert into escaneos (codigo, item_id, accion, resultado, detalle)
  values (v_item.codigo, v_item.id, 'reversion', 'ok', 'reversión manual desde la app');

  return jsonb_build_object('resultado','ok','item',to_jsonb(v_item));
end;
$$;

-- ---------------------------------------------------------------------
-- Marca de etiqueta desactualizada al editar campos impresos
-- ---------------------------------------------------------------------

create or replace function marcar_desactualizada()
returns trigger
language plpgsql
as $$
begin
  if new.impresa_at is not null and (
       new.nombre   is distinct from old.nombre   or
       new.medidas  is distinct from old.medidas  or
       new.material is distinct from old.material or
       new.cantidad is distinct from old.cantidad
     ) then
    new.desactualizada := true;
  end if;
  return new;
end;
$$;

drop trigger if exists items_desactualizada on items;
create trigger items_desactualizada
  before update on items
  for each row execute function marcar_desactualizada();

-- ---------------------------------------------------------------------
-- RLS
-- La app corre sin registro de usuario: una sola tablet compartida en el
-- taller. Las políticas abren lectura y escritura al rol anon.
-- Si más adelante se activa login por operario, reemplazar `true` por
-- `auth.role() = 'authenticated'` en las cuatro tablas.
-- ---------------------------------------------------------------------

alter table proyectos enable row level security;
alter table areas     enable row level security;
alter table items     enable row level security;
alter table escaneos  enable row level security;

drop policy if exists p_proyectos on proyectos;
drop policy if exists p_areas     on areas;
drop policy if exists p_items     on items;
drop policy if exists p_escaneos  on escaneos;

create policy p_proyectos on proyectos for all using (true) with check (true);
create policy p_areas     on areas     for all using (true) with check (true);
create policy p_items     on items     for all using (true) with check (true);
create policy p_escaneos  on escaneos  for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table items;
alter publication supabase_realtime add table escaneos;
