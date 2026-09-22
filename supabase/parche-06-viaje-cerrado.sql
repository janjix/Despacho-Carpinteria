-- =====================================================================
-- Parche 06 · un viaje despachado ya no recibe carga
--
-- Ejecutar después del parche 05. Es idempotente.
--
-- Hasta ahora escanear() aceptaba bultos contra viajes en estado 'cargando'
-- y también 'despachado'. Eso permitía registrar que un bulto subió a un
-- camión que ya había salido del taller, que es justo lo contrario de lo que
-- la app existe para evitar.
--
-- A partir de aquí solo 'cargando' recibe carga. Un bulto escaneado con el
-- camión ya despachado se marca como cargado igual, pero queda sin asignar y
-- aparece en items_sin_viaje para resolverlo a mano.
-- =====================================================================

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
    values (v_plano, 'carga', 'sin_viaje', 'no había viaje abierto');
    return jsonb_build_object('resultado','sin_viaje','codigo',v_plano);
  end if;

  if v_viaje is not null then
    select estado into v_estado from viajes where id = v_viaje and deleted_at is null;
    -- Solo un viaje que sigue cargando admite bultos nuevos
    if v_estado is distinct from 'cargando' then
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

-- Asignar a mano tampoco debe poder meter bultos en un camión que ya salió
create or replace function asignar_a_viaje(p_viaje uuid, p_items uuid[])
returns integer
language plpgsql
as $$
declare
  v_n      integer;
  v_estado text;
begin
  if p_viaje is null then raise exception 'Falta el viaje'; end if;

  select estado into v_estado from viajes where id = p_viaje and deleted_at is null;
  if v_estado is distinct from 'cargando' then
    raise exception 'El viaje ya no está cargando: no admite bultos nuevos';
  end if;

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
