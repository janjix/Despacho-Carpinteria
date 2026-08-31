-- =====================================================================
-- Parche 04 · códigos únicos garantizados
--
-- Ejecutar después de los parches 02 y 03. Es idempotente.
--
-- El fallo que corrige: el código se armaba en el navegador abreviando el
-- nombre a tres letras para el área y cinco para el proyecto. Dos áreas que
-- empiezan igual daban la misma abreviatura, sus contadores corrían por
-- separado, y al insertar el segundo ítem chocaba contra un código que ya
-- existía. El error llegaba al usuario como un 409 sin explicación.
--
--   Vestier principal → VES     Vestidor        → VES     colisión
--   Baño              → BAN     Baño de visitas → BAN     colisión
--   Casa Montaña 12   → CASAM   Casa Montaña 14 → CASAM   colisión
--
-- La solución no es abreviar mejor, porque cualquier abreviatura acaba
-- chocando. Es generar el código donde se puede comprobar la unicidad de
-- verdad: dentro de la transacción que inserta.
-- =====================================================================

-- unaccent no está disponible en todos los proyectos, así que se resuelve
-- con translate, que cubre el español sin instalar extensiones
create or replace function unaccent_simple(p_texto text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p_texto, ''),
    'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
    'aeiouAEIOUaeiouAEIOUaeiouAEIOUnNcC'
  );
$$;

create or replace function abreviar_texto(p_texto text, p_largo int)
returns text
language sql
immutable
as $$
  select coalesce(nullif(
    left(regexp_replace(upper(unaccent_simple(p_texto)), '[^A-Z0-9]', '', 'g'), p_largo),
  ''), 'X');
$$;

-- ---------------------------------------------------------------------
-- Abreviatura libre dentro de su ámbito
--
-- Prueba la abreviatura natural y, si ya está tomada, cambia el último
-- carácter por 2, 3, 4… así VES y VES2 conviven sin que nadie lo note.
-- ---------------------------------------------------------------------

create or replace function codigo_corto_libre(
  p_texto text,
  p_largo int,
  p_tomados text[]
)
returns text
language plpgsql
immutable
as $$
declare
  v_base text := abreviar_texto(p_texto, p_largo);
  v_try  text := v_base;
  v_n    int := 1;
begin
  while v_try = any(p_tomados) loop
    v_n := v_n + 1;
    -- Se sustituye el último carácter para no crecer el largo del código
    v_try := left(v_base, greatest(1, p_largo - length(v_n::text))) || v_n::text;
    if v_n > 99 then
      v_try := v_base || v_n::text;   -- caso extremo: se acepta más largo
      exit;
    end if;
  end loop;
  return v_try;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de proyecto y de área con código corto garantizado
-- ---------------------------------------------------------------------

create or replace function crear_proyecto(
  p_nombre text,
  p_cliente text default null,
  p_fecha date default null
)
returns proyectos
language plpgsql
as $$
declare
  v_fila proyectos%rowtype;
  v_corto text;
begin
  select codigo_corto_libre(
    p_nombre, 5,
    coalesce(array_agg(codigo_corto), array[]::text[])
  ) into v_corto
  from proyectos where deleted_at is null;

  insert into proyectos (nombre, cliente, codigo_corto, fecha_despacho)
  values (trim(p_nombre), nullif(trim(coalesce(p_cliente, '')), ''), v_corto, p_fecha)
  returning * into v_fila;

  return v_fila;
end;
$$;

create or replace function crear_area(
  p_proyecto uuid,
  p_nombre text,
  p_orden int default 0
)
returns areas
language plpgsql
as $$
declare
  v_fila areas%rowtype;
  v_corto text;
begin
  -- El ámbito es el proyecto: dos proyectos pueden tener su propia COC
  select codigo_corto_libre(
    p_nombre, 3,
    coalesce(array_agg(codigo_corto), array[]::text[])
  ) into v_corto
  from areas where proyecto_id = p_proyecto and deleted_at is null;

  insert into areas (proyecto_id, nombre, codigo_corto, orden)
  values (p_proyecto, trim(p_nombre), v_corto, p_orden)
  returning * into v_fila;

  return v_fila;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de ítems
--
-- Todo el trabajo ocurre aquí dentro: se reserva el correlativo, se arma el
-- código y se inserta, en una sola transacción. Si aun así apareciera una
-- colisión (un código heredado de antes de este parche), se avanza el
-- correlativo y se reintenta en lugar de fallar.
--
-- p_filas: [{"nombre":"","descripcion":"","medidas":"","material":"",
--            "notas":"","cantidad":1}, ...]
-- ---------------------------------------------------------------------

create or replace function crear_items(p_area uuid, p_filas jsonb)
returns setof items
language plpgsql
as $$
declare
  v_area      areas%rowtype;
  v_proyecto  proyectos%rowtype;
  v_fila      jsonb;
  v_cantidad  int;
  v_grupo     uuid;
  v_i         int;
  v_codigo    text;
  v_numero    int;
  v_intentos  int;
begin
  select * into v_area from areas where id = p_area and deleted_at is null;
  if not found then raise exception 'El área no existe'; end if;

  select * into v_proyecto from proyectos where id = v_area.proyecto_id;
  if not found then raise exception 'El proyecto no existe'; end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_cantidad := greatest(1, coalesce((v_fila->>'cantidad')::int, 1));
    v_grupo := gen_random_uuid();

    for v_i in 1..v_cantidad loop
      v_intentos := 0;
      loop
        v_numero := reservar_correlativo(p_area, 1);
        v_codigo := 'TECC-' || v_proyecto.codigo_corto || '-' ||
                    v_area.codigo_corto || '-' || lpad(v_numero::text, 3, '0');

        exit when not exists (
          select 1 from items
           where codigo_plano = upper(regexp_replace(v_codigo, '[^A-Za-z0-9]', '', 'g'))
        );

        v_intentos := v_intentos + 1;
        if v_intentos > 500 then
          raise exception 'No se pudo generar un código libre para el área %', v_area.nombre;
        end if;
      end loop;

      return query
      insert into items (
        area_id, grupo_id, codigo, nombre, descripcion, medidas, material,
        notas, cantidad, indice
      ) values (
        p_area, v_grupo, v_codigo,
        coalesce(nullif(trim(coalesce(v_fila->>'nombre', '')), ''), 'Sin nombre'),
        nullif(trim(coalesce(v_fila->>'descripcion', '')), ''),
        nullif(trim(coalesce(v_fila->>'medidas', '')), ''),
        nullif(trim(coalesce(v_fila->>'material', '')), ''),
        nullif(trim(coalesce(v_fila->>'notas', '')), ''),
        v_cantidad, v_i
      )
      returning *;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Reparación de códigos cortos ya duplicados
--
-- Renombra la abreviatura de las áreas y proyectos que hoy comparten código
-- con otro. Los ítems ya creados conservan su código: una etiqueta impresa
-- no puede cambiar de nombre.
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  v_tomados text[];
  v_nuevo text;
begin
  -- Proyectos
  for r in
    select id, nombre, codigo_corto from proyectos
     where deleted_at is null
       and codigo_corto in (
         select codigo_corto from proyectos where deleted_at is null
         group by codigo_corto having count(*) > 1
       )
     order by created_at
     offset 0
  loop
    select coalesce(array_agg(codigo_corto), array[]::text[]) into v_tomados
      from proyectos where deleted_at is null and id <> r.id;
    if r.codigo_corto = any(v_tomados) then
      v_nuevo := codigo_corto_libre(r.nombre, 5, v_tomados);
      update proyectos set codigo_corto = v_nuevo where id = r.id;
    end if;
  end loop;

  -- Áreas, dentro de cada proyecto
  for r in
    select a.id, a.nombre, a.codigo_corto, a.proyecto_id
      from areas a
     where a.deleted_at is null
     order by a.proyecto_id, a.created_at
  loop
    select coalesce(array_agg(codigo_corto), array[]::text[]) into v_tomados
      from areas
     where proyecto_id = r.proyecto_id and deleted_at is null and id <> r.id;
    if r.codigo_corto = any(v_tomados) then
      v_nuevo := codigo_corto_libre(r.nombre, 3, v_tomados);
      update areas set codigo_corto = v_nuevo where id = r.id;
    end if;
  end loop;
end $$;
