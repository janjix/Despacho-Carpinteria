-- =====================================================================
-- Parche 03 · escaneo automático
--
-- Ejecutar después de migracion.sql y parche-02. Es idempotente.
--
-- Cambio de fondo: desaparece el modo. La primera lectura de una etiqueta
-- significa embalado y la segunda significa cargado, porque el estado del
-- bulto ya contiene esa información y volver a pedirla solo abría la puerta
-- a que alguien la diera mal.
--
-- El caso real que lo motiva: la laptop está lejos del puesto de embalaje,
-- el escáner llega por radio y nadie está frente a la pantalla para cambiar
-- de modo. Un modo mal puesto habría marcado como cargado un camión entero
-- que en realidad apenas se estaba embalando.
-- =====================================================================

alter table escaneos drop constraint if exists escaneos_accion_check;
alter table escaneos add constraint escaneos_accion_check
  check (accion in ('embalaje','carga','reversion','anulacion','auto'));

-- ---------------------------------------------------------------------
-- Escaneo
--
--   p_modo = 'auto'      decide según el estado del bulto
--   p_modo = 'embalaje'  fuerza la primera etapa
--   p_modo = 'carga'     fuerza la segunda y exige viaje
--
-- En automático el viaje es opcional. Si no hay ninguno activo, el bulto se
-- marca como cargado igual y queda sin asignar, con aviso en la app.
-- Rechazarlo habría sido peor: el operario está lejos de la pantalla, no
-- vería el rechazo, y el bulto subiría al camión sin registro de ningún tipo.
-- ---------------------------------------------------------------------

drop function if exists escanear(text, text);
drop function if exists escanear(text, text, uuid);

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

  if p_modo = 'carga' and v_viaje is null then
    insert into escaneos (codigo, accion, resultado, detalle)
    values (v_plano, 'carga', 'sin_viaje', 'no había viaje seleccionado');
    return jsonb_build_object('resultado','sin_viaje','codigo',v_plano);
  end if;

  if v_viaje is not null then
    select estado into v_estado from viajes where id = v_viaje and deleted_at is null;
    -- Viaje cerrado o inexistente: se ignora y el bulto queda sin asignar
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
    'item', to_jsonb(v_item)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Bultos cargados que quedaron sin viaje
-- ---------------------------------------------------------------------

create or replace view items_sin_viaje as
select
  i.id, i.codigo, i.nombre, i.medidas, i.indice, i.cantidad, i.cargado_at,
  a.nombre  as area,
  p.id      as proyecto_id,
  p.nombre  as proyecto,
  p.cliente
from items i
join areas a on a.id = i.area_id
join proyectos p on p.id = a.proyecto_id
where i.deleted_at is null
  and i.estado = 'cargado'
  and i.viaje_id is null;

-- Asigna a un viaje bultos que ya estaban cargados pero sin camión
create or replace function asignar_a_viaje(p_viaje uuid, p_items uuid[])
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  if p_viaje is null then raise exception 'Falta el viaje'; end if;

  update items
     set viaje_id = p_viaje
   where id = any(p_items)
     and deleted_at is null
     and estado = 'cargado';
  get diagnostics v_n = row_count;

  insert into escaneos (codigo, item_id, accion, resultado, detalle, viaje_id)
  select codigo, id, 'carga', 'ok', 'asignado al viaje después del escaneo', p_viaje
    from items where id = any(p_items) and viaje_id = p_viaje;

  return v_n;
end;
$$;
