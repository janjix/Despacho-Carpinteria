-- =====================================================================
-- Parche 08 · la marca pasa a ser FATE
--
-- Ejecutar después del parche 07. Es idempotente.
--
-- Los códigos nuevos empiezan por FATE en lugar de TECC. Las etiquetas ya
-- impresas siguen funcionando igual: el escaneo busca el código exacto que
-- tiene cada bulto, y un código nunca cambia después de creado. Así que en un
-- mismo proyecto pueden convivir bultos TECC-… viejos y FATE-… nuevos sin
-- ningún problema, y reimprimir una etiqueta vieja la saca con su TECC.
--
-- El prefijo sale de una sola función. Si la marca vuelve a cambiar, se
-- edita prefijo_codigo() y nada más.
-- =====================================================================

create or replace function prefijo_codigo()
returns text
language sql
immutable
as $$
  select 'FATE';
$$;

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
        v_codigo := prefijo_codigo() || '-' || v_proyecto.codigo_corto || '-' ||
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
    new.codigo := prefijo_codigo() || '-' || v_proyecto.codigo_corto || '-' ||
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
