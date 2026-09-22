-- =====================================================================
-- Diagnóstico: un bulto queda cargado al escanearlo por primera vez
--
-- Pegar en el SQL Editor y ejecutar. No cambia nada.
--
-- Antes de correrlo, sustituye 'Frontales de gavetas' por el nombre del ítem
-- que dio problema. Aparece tres veces más abajo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ¿Hay códigos repetidos?
--
-- Si dos etiquetas comparten código, al leer una el sistema encuentra la
-- otra. Si ya estaba embalada, la pasa a cargado. Esta es la causa más
-- probable de que "la décima" quede cargada.
-- ---------------------------------------------------------------------
select 'CÓDIGOS REPETIDOS' as revision;
select codigo_plano, count(*) as veces, array_agg(codigo) as codigos,
       array_agg(nombre) as items
  from items
 where deleted_at is null
 group by codigo_plano
having count(*) > 1;

-- ---------------------------------------------------------------------
-- 2. Los bultos de ese ítem, con su estado y sus horas
-- ---------------------------------------------------------------------
select 'BULTOS DEL ÍTEM' as revision;
select codigo, indice, cantidad, estado,
       to_char(embalado_at, 'HH24:MI:SS') as embalado,
       to_char(cargado_at, 'HH24:MI:SS')  as cargado
  from items
 where nombre ilike '%' || 'Frontales de gavetas' || '%'
   and deleted_at is null
 order by codigo;

-- ---------------------------------------------------------------------
-- 3. Qué llegó de verdad desde el lector
--
-- La columna codigo guarda lo que se leyó. Si aparece dos veces el mismo,
-- el lector o el operario repitieron la etiqueta. Si aparece un código
-- raro, el lector está leyendo mal.
-- ---------------------------------------------------------------------
select 'ÚLTIMOS ESCANEOS DE ESE ÍTEM' as revision;
select e.codigo, e.accion, e.resultado, coalesce(e.detalle,'') as detalle,
       to_char(e.created_at, 'HH24:MI:SS') as hora
  from escaneos e
  left join items i on i.id = e.item_id
 where i.nombre ilike '%' || 'Frontales de gavetas' || '%'
    or e.codigo ilike '%' || replace('Frontales de gavetas', ' ', '') || '%'
 order by e.created_at desc
 limit 40;

-- ---------------------------------------------------------------------
-- 4. ¿Existe el índice que impide códigos duplicados?
-- ---------------------------------------------------------------------
select 'ÍNDICE DE UNICIDAD' as revision;
select indexname from pg_indexes
 where tablename = 'items' and indexname in ('items_codigo_uidx','items_plano_uidx');
