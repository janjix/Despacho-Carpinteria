-- =====================================================================
-- Parche 06 · viaje activo compartido
--
-- Ejecutar después del parche 05. Es idempotente.
--
-- Hasta ahora el viaje activo vivía en el navegador de cada dispositivo. Eso
-- rompe el flujo real del taller: el viaje se abre en la laptop, pero se
-- escanea desde el televisor del galpón. Dos navegadores, dos preferencias,
-- y todo lo escaneado desde el televisor terminaba cargado sin camión.
--
-- El viaje activo es un hecho del taller, no una preferencia de pantalla:
-- solo se carga un camión a la vez. Así que vive en la base y llega a todos
-- los dispositivos por Realtime.
-- =====================================================================

alter table viajes add column if not exists es_activo boolean not null default false;

-- Solo un viaje activo a la vez en todo el taller
create unique index if not exists viajes_uno_activo
  on viajes ((es_activo)) where es_activo and deleted_at is null;

create or replace function activar_viaje(p_viaje uuid)
returns jsonb
language plpgsql
as $$
declare
  v_estado text;
begin
  update viajes set es_activo = false where es_activo;

  if p_viaje is null then
    return jsonb_build_object('resultado','ok','viaje',null);
  end if;

  select estado into v_estado from viajes where id = p_viaje and deleted_at is null;
  if v_estado is null then
    return jsonb_build_object('resultado','no_encontrado');
  end if;
  -- Activar a mano solo tiene sentido con un viaje que se está cargando
  if v_estado <> 'cargando' then
    return jsonb_build_object('resultado','cerrado','estado',v_estado);
  end if;

  update viajes set es_activo = true where id = p_viaje;
  return jsonb_build_object('resultado','ok','viaje',p_viaje);
end;
$$;

-- Un viaje que sale del taller deja de ser el activo en cuanto se marca como
-- despachado. Sigue admitiendo escaneos si alguien lo elige a mano (un bulto
-- que se subió en el último momento), pero deja de ser el destino por
-- omisión: si no, el primer escaneo del día siguiente se cargaría en un
-- camión que ya está en la obra.
create or replace function soltar_viaje_cerrado()
returns trigger
language plpgsql
as $$
begin
  if new.estado <> 'cargando' or new.deleted_at is not null then
    new.es_activo := false;
  end if;
  return new;
end;
$$;

drop trigger if exists viajes_soltar_activo on viajes;
create trigger viajes_soltar_activo
  before update on viajes
  for each row execute function soltar_viaje_cerrado();

-- Al abrir un viaje pasa a ser el activo: se abre justo cuando se empieza
-- a cargar, así que es lo que espera quien lo abre
create or replace function crear_viaje(p_camion uuid, p_destino text default null)
returns viajes
language plpgsql
as $$
declare
  v_fila viajes%rowtype;
begin
  update viajes set es_activo = false where es_activo;

  insert into viajes (camion_id, codigo, destino, es_activo)
  values (p_camion, siguiente_codigo_viaje(),
          nullif(trim(coalesce(p_destino, '')), ''), true)
  returning * into v_fila;

  return v_fila;
end;
$$;

-- create or replace no admite insertar una columna en medio de una vista que
-- ya existe, así que se suelta y se vuelve a crear
drop view if exists viaje_resumen;

create view viaje_resumen as
select
  v.id, v.codigo, v.estado, v.destino, v.salida_at, v.entrega_at,
  v.created_at, v.es_activo,
  c.id     as camion_id,
  c.codigo as camion_codigo,
  c.placa,
  c.conductor,
  count(i.id)                   as bultos,
  count(distinct a.proyecto_id) as proyectos,
  min(i.cargado_at)             as primer_escaneo,
  max(i.cargado_at)             as ultimo_escaneo
from viajes v
join camiones c on c.id = v.camion_id
left join items i on i.viaje_id = v.id and i.deleted_at is null
left join areas a on a.id = i.area_id
where v.deleted_at is null
group by v.id, c.id;

-- El escaneo usa el viaje activo cuando no le pasan uno, así el televisor
-- carga contra el camión correcto sin que nadie lo configure allí
create or replace function escanear(
  p_codigo text,
  p_modo text default 'auto',
  p_viaje uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_item      items%rowtype;
  v_plano     text := upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  v_resultado text;
  v_accion    text;
  v_detalle   text;
  v_estado    text;
  v_previo    text;
  v_viaje     uuid := p_viaje;
begin
  if p_modo not in ('auto','embalaje','carga') then
    raise exception 'Modo inválido: %', p_modo;
  end if;

  if v_viaje is null then
    select id into v_viaje from viajes
     where es_activo and deleted_at is null and estado = 'cargando'
     limit 1;
  end if;

  if p_modo = 'carga' and v_viaje is null then
    insert into escaneos (codigo, accion, resultado, detalle)
    values (v_plano, 'carga', 'sin_viaje', 'no había viaje activo');
    return jsonb_build_object('resultado','sin_viaje','codigo',v_plano);
  end if;

  if v_viaje is not null then
    select estado into v_estado from viajes where id = v_viaje and deleted_at is null;
    if v_estado is null or v_estado not in ('cargando','despachado') then
      v_viaje := null;
    end if;
  end if;

  select * into v_item
    from items
   where codigo_plano = v_plano and deleted_at is null
     for update;

  if not found then
    insert into escaneos (codigo, accion, resultado, viaje_id)
    values (v_plano, case when p_modo = 'auto' then 'auto' else p_modo end,
            'no_encontrado', v_viaje);
    return jsonb_build_object('resultado','no_encontrado','codigo',v_plano);
  end if;

  v_previo := v_item.estado;

  if p_modo = 'auto' then
    v_accion := case v_item.estado when 'pendiente' then 'embalaje' else 'carga' end;
  else
    v_accion := p_modo;
  end if;

  if v_accion = 'embalaje' then
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
         set estado = 'cargado', cargado_at = now(), viaje_id = v_viaje
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
      if v_viaje is null then v_detalle := 'cargado sin viaje asignado'; end if;
    elsif v_item.estado = 'cargado' then
      v_resultado := 'duplicado';
    else
      v_resultado := 'fuera_de_orden';
    end if;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado, detalle, viaje_id)
  values (v_item.codigo, v_item.id, v_accion, v_resultado, v_detalle, v_viaje);

  return jsonb_build_object(
    'resultado', v_resultado,
    'accion', v_accion,
    'previo', v_previo,
    'sin_viaje', (v_accion = 'carga' and v_resultado = 'ok' and v_viaje is null),
    'viaje_id', v_viaje,
    'item', to_jsonb(v_item)
  );
end;
$$;

-- Si hay viajes abiertos y ninguno marcado, se activa el más reciente
update viajes set es_activo = true
 where id = (
   select id from viajes
    where deleted_at is null and estado = 'cargando'
    order by created_at desc limit 1
 )
 and not exists (select 1 from viajes where es_activo and deleted_at is null);
