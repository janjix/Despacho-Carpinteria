-- =====================================================================
-- Verificación de la instalación
--
-- Pegar en el SQL Editor y ejecutar. Dice qué falta, sin cambiar nada.
-- =====================================================================

select
  'Tablas' as parte,
  string_agg(t.nombre, ', ' order by t.nombre) filter (where c.oid is null) as faltan,
  count(*) filter (where c.oid is not null) || ' de ' || count(*) as estado
from (values
  ('proyectos'),('areas'),('items'),('escaneos'),('camiones'),('viajes')
) as t(nombre)
left join pg_class c on c.relname = t.nombre and c.relkind = 'r'

union all

select
  'Funciones',
  string_agg(f.nombre, ', ' order by f.nombre) filter (where p.oid is null),
  count(*) filter (where p.oid is not null) || ' de ' || count(*)
from (values
  ('reservar_correlativo'),('escanear'),('anular_escaneo'),
  ('siguiente_codigo_viaje'),('asignar_a_viaje'),
  ('crear_proyecto'),('crear_area'),('crear_items'),('codigo_corto_libre'),
  ('cambiar_estado_item'),('normalizar_codigo_item'),('normalizar_codigo_area')
) as f(nombre)
left join pg_proc p on p.proname = f.nombre

union all

select
  'Vistas',
  string_agg(v.nombre, ', ' order by v.nombre) filter (where c.oid is null),
  count(*) filter (where c.oid is not null) || ' de ' || count(*)
from (values
  ('viaje_contenido'),('viaje_resumen'),('items_sin_viaje'),('codigos_repetidos')
) as v(nombre)
left join pg_class c on c.relname = v.nombre and c.relkind = 'v'

union all

select
  'Triggers',
  string_agg(g.nombre, ', ' order by g.nombre) filter (where t.oid is null),
  count(*) filter (where t.oid is not null) || ' de ' || count(*)
from (values
  ('items_codigo_libre'),('areas_codigo_libre'),('items_desactualizada')
) as g(nombre)
left join pg_trigger t on t.tgname = g.nombre;

-- Si algo sale en "faltan", ejecuta los parches de esta carpeta en orden:
--   migracion.sql
--   parche-02-camiones-viajes.sql
--   parche-03-escaneo-automatico.sql
--   parche-04-codigos-unicos.sql
--   parche-05-estado-manual.sql
--   parche-06-viaje-cerrado.sql
--
-- (parche-01 solo aplica a bases anteriores al código sin guiones)
