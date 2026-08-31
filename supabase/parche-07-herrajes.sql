-- =====================================================================
-- Parche 07 · herrajes
--
-- Ejecutar después del parche 06. Es idempotente.
--
-- Un bulto de herrajes es un ítem como cualquier otro: tiene su código, su
-- etiqueta y sus dos escaneos. Lo que cambia es que además lleva una lista de
-- lo que hay dentro.
--
-- Ese contenido no son ítems: una caja con veinte bisagras y cuatro
-- correderas es UN bulto que sube al camión una vez. Si cada herraje fuera un
-- ítem, habría que escanear veinticuatro etiquetas y los conteos del panel
-- dirían cualquier cosa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo. Es global y se reutiliza entre proyectos.
-- ---------------------------------------------------------------------

create table if not exists herrajes (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null,
  nombre     text not null,
  marca      text,
  medida     text,
  unidad     text,                       -- 'par', 'juego', 'metro'; null = unidad suelta
  notas      text,
  activo     boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists herrajes_codigo_uidx
  on herrajes (upper(codigo)) where deleted_at is null;
create index if not exists herrajes_nombre_idx on herrajes (lower(nombre));

-- ---------------------------------------------------------------------
-- Qué lleva dentro cada bulto de herrajes
-- ---------------------------------------------------------------------

alter table items add column if not exists tipo text not null default 'mueble'
  check (tipo in ('mueble','herrajes'));

create table if not exists bulto_herrajes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  herraje_id uuid not null references herrajes(id) on delete restrict,
  cantidad   numeric,                    -- opcional: no todo se cuenta
  nota       text,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bulto_herrajes_item_idx on bulto_herrajes (item_id);
create unique index if not exists bulto_herrajes_unico
  on bulto_herrajes (item_id, herraje_id);

-- ---------------------------------------------------------------------
-- Crear un bulto de herrajes
--
-- Devuelve el ítem creado. El código se genera igual que el de un mueble, así
-- que la etiqueta y el escaneo funcionan sin ningún caso especial.
--
-- p_contenido: [{"herraje_id":"...","cantidad":20,"nota":""}, ...]
-- ---------------------------------------------------------------------

create or replace function crear_bulto_herrajes(
  p_area uuid,
  p_nombre text,
  p_contenido jsonb,
  p_notas text default null
)
returns items
language plpgsql
as $$
declare
  v_item items%rowtype;
  v_fila jsonb;
  v_n    int := 0;
begin
  select * into v_item
    from crear_items(p_area, jsonb_build_array(jsonb_build_object(
      'nombre', coalesce(nullif(trim(p_nombre), ''), 'Herrajes'),
      'notas', p_notas,
      'cantidad', 1
    )))
   limit 1;

  if v_item.id is null then
    raise exception 'No se pudo crear el bulto de herrajes';
  end if;

  update items set tipo = 'herrajes' where id = v_item.id returning * into v_item;

  for v_fila in select * from jsonb_array_elements(coalesce(p_contenido, '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into bulto_herrajes (item_id, herraje_id, cantidad, nota, orden)
    values (
      v_item.id,
      (v_fila->>'herraje_id')::uuid,
      nullif(v_fila->>'cantidad', '')::numeric,
      nullif(trim(coalesce(v_fila->>'nota', '')), ''),
      v_n
    )
    on conflict (item_id, herraje_id) do update
      set cantidad = excluded.cantidad, nota = excluded.nota;
  end loop;

  return v_item;
end;
$$;

-- Reemplaza el contenido de un bulto ya creado
create or replace function actualizar_bulto_herrajes(p_item uuid, p_contenido jsonb)
returns integer
language plpgsql
as $$
declare
  v_fila jsonb;
  v_n    int := 0;
begin
  delete from bulto_herrajes where item_id = p_item;

  for v_fila in select * from jsonb_array_elements(coalesce(p_contenido, '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into bulto_herrajes (item_id, herraje_id, cantidad, nota, orden)
    values (
      p_item,
      (v_fila->>'herraje_id')::uuid,
      nullif(v_fila->>'cantidad', '')::numeric,
      nullif(trim(coalesce(v_fila->>'nota', '')), ''),
      v_n
    );
  end loop;

  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Contenido legible, para la etiqueta y para la guía
-- ---------------------------------------------------------------------

drop view if exists bulto_contenido cascade;
create view bulto_contenido as
select
  b.item_id,
  b.herraje_id,
  b.orden,
  h.codigo,
  h.nombre,
  h.marca,
  h.medida,
  h.unidad,
  b.cantidad,
  b.nota,
  -- Línea ya formateada: "24 Bisagra recta Blum 35mm".
  -- La cantidad se muestra sin decimales cuando es entera: "6 par" y no
  -- "6.000 par", que es lo que devuelve to_char con la máscara genérica.
  concat_ws(' ',
    case when b.cantidad is not null then
      case when b.cantidad = trunc(b.cantidad)
           then trunc(b.cantidad)::bigint::text
           else trim(trailing '0' from trim(trailing '.' from b.cantidad::text))
      end || coalesce(' ' || h.unidad, '')
    end,
    h.nombre,
    nullif(concat_ws(' ', h.marca, h.medida), '')
  ) as linea
from bulto_herrajes b
join herrajes h on h.id = b.herraje_id;

-- El contenido viaja junto al viaje, para la guía de despacho
create or replace view viaje_herrajes as
select
  i.viaje_id,
  i.id      as item_id,
  i.codigo  as item_codigo,
  i.nombre  as bulto,
  c.orden,
  c.codigo  as herraje_codigo,
  c.linea,
  c.cantidad
from items i
join bulto_contenido c on c.item_id = i.id
where i.deleted_at is null and i.tipo = 'herrajes';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table herrajes       enable row level security;
alter table bulto_herrajes enable row level security;

drop policy if exists p_herrajes on herrajes;
drop policy if exists p_bulto_herrajes on bulto_herrajes;
create policy p_herrajes       on herrajes       for all using (true) with check (true);
create policy p_bulto_herrajes on bulto_herrajes for all using (true) with check (true);
