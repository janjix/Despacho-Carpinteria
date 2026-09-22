-- =====================================================================
-- Parche 05 · cambio manual de estado y blindaje del código
--
-- Ejecutar después del parche 04. Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Blindaje del código de ítem
--
-- El parche 04 movió la generación del código a la base, pero solo protege a
-- quien llame a crear_items. Un navegador con la versión anterior en caché
-- sigue insertando directo en items y vuelve a chocar con el 409.
--
-- Este trigger corrige el código en el momento del insert, venga de donde
-- venga: si el que llega ya está ocupado, avanza el correlativo del área
-- hasta encontrar uno libre.
-- ---------------------------------------------------------------------

create or replace function normalizar_codigo_item()
returns trigger
language plpgsql
as $$
declare
  v_area      areas%rowtype;
  v_proyecto  proyectos%rowtype;
  v_plano     text;
  v_numero    int;
  v_intentos  int := 0;
begin
  v_plano := upper(regexp_replace(coalesce(new.codigo, ''), '[^A-Za-z0-9]', '', 'g'));

  -- Código utilizable y libre: se respeta tal cual
  if v_plano <> '' and not exists (
    select 1 from items where codigo_plano = v_plano
  ) then
    return new;
  end if;

  select * into v_area from areas where id = new.area_id;
  if not found then raise exception 'El área del ítem no existe'; end if;
  select * into v_proyecto from proyectos where id = v_area.proyecto_id;
  if not found then raise exception 'El proyecto del área no existe'; end if;

  loop
    v_numero := reservar_correlativo(new.area_id, 1);
    new.codigo := 'TECC-' || v_proyecto.codigo_corto || '-' ||
                  v_area.codigo_corto || '-' || lpad(v_numero::text, 3, '0');

    exit when not exists (
      select 1 from items
       where codigo_plano = upper(regexp_replace(new.codigo, '[^A-Za-z0-9]', '', 'g'))
    );

    v_intentos := v_intentos + 1;
    if v_intentos > 500 then
      raise exception 'No se pudo generar un código libre en el área %', v_area.nombre;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists items_codigo_libre on items;
create trigger items_codigo_libre
  before insert on items
  for each row execute function normalizar_codigo_item();

-- Mismo blindaje para las áreas: si llega un código corto ya usado en el
-- proyecto, se cambia por uno libre en lugar de dejar dos áreas iguales
create or replace function normalizar_codigo_area()
returns trigger
language plpgsql
as $$
declare
  v_tomados text[];
begin
  select coalesce(array_agg(codigo_corto), array[]::text[]) into v_tomados
    from areas
   where proyecto_id = new.proyecto_id and deleted_at is null and id <> new.id;

  if new.codigo_corto is null or new.codigo_corto = '' or new.codigo_corto = any(v_tomados) then
    new.codigo_corto := codigo_corto_libre(coalesce(new.nombre, 'X'), 3, v_tomados);
  end if;
  return new;
end;
$$;

drop trigger if exists areas_codigo_libre on areas;
create trigger areas_codigo_libre
  before insert on areas
  for each row execute function normalizar_codigo_area();

-- Alinea cada contador con los códigos que de verdad existen
update areas a
   set contador = greatest(a.contador, coalesce((
     select max(nullif(regexp_replace(i.codigo, '^.*-', ''), '')::int)
       from items i
      where i.area_id = a.id and i.codigo ~ '-[0-9]+$'
   ), 0));

-- ---------------------------------------------------------------------
-- Cambio manual de estado
--
-- Distinto de anular_escaneo, que solo retrocede un paso. Aquí se lleva el
-- ítem a cualquier estado, con motivo, y queda en la bitácora igual que un
-- escaneo. La app no debería tener puertas traseras silenciosas.
--
-- Reglas de coherencia:
--   pendiente  limpia ambas horas y suelta el viaje
--   embalado   conserva la hora de embalaje si ya existía, suelta el viaje
--   cargado    exige que exista hora de embalaje; si no, la inventa ahora
-- ---------------------------------------------------------------------

create or replace function cambiar_estado_item(
  p_item uuid,
  p_estado text,
  p_motivo text default null,
  p_viaje uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_item   items%rowtype;
  v_previo text;
  v_ahora  timestamptz := now();
begin
  if p_estado not in ('pendiente','embalado','cargado') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  select * into v_item from items where id = p_item and deleted_at is null for update;
  if not found then
    return jsonb_build_object('resultado','no_encontrado');
  end if;

  v_previo := v_item.estado;
  if v_previo = p_estado then
    return jsonb_build_object('resultado','duplicado','item',to_jsonb(v_item));
  end if;

  if p_estado = 'pendiente' then
    update items
       set estado = 'pendiente', embalado_at = null, cargado_at = null, viaje_id = null
     where id = p_item returning * into v_item;

  elsif p_estado = 'embalado' then
    update items
       set estado = 'embalado',
           embalado_at = coalesce(embalado_at, v_ahora),
           cargado_at = null,
           viaje_id = null
     where id = p_item returning * into v_item;

  else
    update items
       set estado = 'cargado',
           embalado_at = coalesce(embalado_at, v_ahora),
           cargado_at = coalesce(cargado_at, v_ahora),
           viaje_id = coalesce(p_viaje, viaje_id)
     where id = p_item returning * into v_item;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado, detalle, viaje_id)
  values (
    v_item.codigo, v_item.id, 'anulacion', 'ok',
    'cambio manual: ' || v_previo || ' → ' || p_estado ||
    coalesce(' · ' || nullif(trim(p_motivo), ''), ''),
    v_item.viaje_id
  );

  return jsonb_build_object('resultado','ok','previo',v_previo,'item',to_jsonb(v_item));
end;
$$;

-- ---------------------------------------------------------------------
-- Diagnóstico de códigos repetidos, por si quedó alguno de antes
-- ---------------------------------------------------------------------

create or replace view codigos_repetidos as
select
  i.codigo_plano,
  count(*)            as veces,
  array_agg(i.codigo) as codigos,
  array_agg(i.nombre) as items,
  array_agg(a.nombre) as areas
from items i
join areas a on a.id = i.area_id
group by i.codigo_plano
having count(*) > 1;
