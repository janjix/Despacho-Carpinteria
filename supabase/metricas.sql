-- =====================================================================
-- Métricas de despacho · TECC
--
-- Solo lectura. Pegar en el SQL Editor y ejecutar por bloques.
--
-- Todo sale de la tabla escaneos, que guarda cada lectura con su hora, su
-- acción y su resultado. Nada hubo que instrumentar aparte: es el registro
-- que la app produce sola al trabajar.
--
-- ADVERTENCIA HONESTA: estas consultas miden cómo va el proceso HOY. No
-- pueden demostrar la mejora frente al método anterior, porque de aquello no
-- quedó ningún dato. Para eso hace falta el bloque 8, que se llena a mano.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1 · Resumen por proyecto
-- ---------------------------------------------------------------------
select
  p.nombre                                       as proyecto,
  p.cliente,
  count(i.id)                                    as bultos,
  count(*) filter (where i.estado = 'cargado')   as cargados,
  count(*) filter (where i.estado = 'embalado')  as embalados,
  count(*) filter (where i.estado = 'pendiente') as pendientes,
  count(distinct i.viaje_id)                     as viajes,
  round(extract(epoch from (max(i.cargado_at) - min(i.embalado_at))) / 3600.0, 1)
                                                 as horas_desde_1er_embalaje
from proyectos p
join areas a on a.proyecto_id = p.id and a.deleted_at is null
join items i on i.area_id = a.id     and i.deleted_at is null
where p.deleted_at is null
group by p.id
order by p.fecha_despacho desc nulls last;


-- ---------------------------------------------------------------------
-- 2 · Ritmo de trabajo
--
-- Bultos por hora de actividad real, separando embalaje y carga. Es la
-- métrica de productividad más directa que da el sistema.
-- ---------------------------------------------------------------------
select
  timezone('America/Caracas', created_at)::date          as dia,
  accion,
  count(*)                                               as escaneos,
  count(distinct date_trunc('hour', created_at))         as horas_activas,
  round(count(*)::numeric /
        nullif(count(distinct date_trunc('hour', created_at)), 0), 1)
                                                         as bultos_por_hora
from escaneos
where resultado = 'ok'
  and accion in ('embalaje','carga')
  and created_at > now() - interval '90 days'
group by 1, 2
order by 1 desc, 2;


-- ---------------------------------------------------------------------
-- 3 · Calidad de la lectura
--
-- Un porcentaje alto de 'duplicado' significa que el operario no ve la
-- confirmación y repite. 'fuera_de_orden' son bultos que llegaron al camión
-- sin haber pasado por embalaje.
-- ---------------------------------------------------------------------
select
  resultado,
  count(*)                                          as veces,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as porcentaje
from escaneos
where created_at > now() - interval '90 days'
group by resultado
order by veces desc;


-- ---------------------------------------------------------------------
-- 4 · Correcciones manuales por semana
--
-- Cada anulación es un caso donde el proceso no salió solo. Si el porcentaje
-- baja con los meses, el método se asentó. Si no baja, hay algo que la app no
-- está resolviendo.
-- ---------------------------------------------------------------------
select
  date_trunc('week', timezone('America/Caracas', created_at))::date as semana,
  count(*) filter (where accion = 'anulacion')                      as correcciones,
  count(*) filter (where resultado = 'ok'
                     and accion in ('embalaje','carga'))            as escaneos_buenos,
  round(100.0 * count(*) filter (where accion = 'anulacion') /
        nullif(count(*) filter (where resultado = 'ok'
                                  and accion in ('embalaje','carga')), 0), 2)
                                                                    as pct_correccion
from escaneos
where created_at > now() - interval '180 days'
group by 1
order by 1 desc;


-- ---------------------------------------------------------------------
-- 5 · Bultos sin camión asignado
--
-- Cargados pero sin viaje: se escanearon sin camión abierto. De cada uno no
-- se sabe en qué camión subió.
-- ---------------------------------------------------------------------
select proyecto, count(*) as sin_camion
from items_sin_viaje
group by proyecto
order by sin_camion desc;


-- ---------------------------------------------------------------------
-- 6 · Espera entre embalar y cargar
--
-- Cuánto tiempo pasa un bulto ocupando sitio en el taller. Una mediana alta
-- indica que se embala mucho antes de tener camión.
-- ---------------------------------------------------------------------
select
  p.nombre as proyecto,
  count(*) as bultos,
  round(extract(epoch from percentile_cont(0.5) within group (
        order by i.cargado_at - i.embalado_at)) / 3600.0, 1) as horas_mediana,
  round(extract(epoch from max(i.cargado_at - i.embalado_at)) / 3600.0, 1) as horas_maximo
from items i
join areas a     on a.id = i.area_id
join proyectos p on p.id = a.proyecto_id
where i.embalado_at is not null and i.cargado_at is not null
  and i.deleted_at is null
group by p.id
order by horas_mediana desc nulls last;


-- ---------------------------------------------------------------------
-- 7 · Completitud del despacho
--
-- De cada viaje ya salido, qué proporción del proyecto se llevó y cuánto
-- quedó atrás. Es lo más cerca que llega el sistema al indicador que de
-- verdad importa.
-- ---------------------------------------------------------------------
with carga as (
  select i.viaje_id, a.proyecto_id, count(*) as se_llevo
  from items i
  join areas a on a.id = i.area_id
  where i.viaje_id is not null and i.deleted_at is null
  group by 1, 2
),
proyecto as (
  select a.proyecto_id, count(*) as total
  from items i join areas a on a.id = i.area_id
  where i.deleted_at is null
  group by 1
)
select
  v.codigo                                       as viaje,
  c.codigo                                       as camion,
  timezone('America/Caracas', v.salida_at)::date as salida,
  p.nombre                                       as proyecto,
  carga.se_llevo,
  proyecto.total                                 as bultos_del_proyecto,
  round(100.0 * carga.se_llevo / proyecto.total, 1) as pct_del_proyecto
from viajes v
join camiones c   on c.id = v.camion_id
join carga        on carga.viaje_id = v.id
join proyecto     on proyecto.proyecto_id = carga.proyecto_id
join proyectos p  on p.id = carga.proyecto_id
where v.deleted_at is null and v.estado in ('despachado','entregado')
order by v.salida_at desc nulls last;


-- =====================================================================
-- 8 · Lo que el sistema NO puede medir
--
-- El indicador que le importa al negocio es cuántas veces hubo que volver a
-- la obra por un bulto que no llegó. Eso ocurre fuera de la app y nadie lo
-- registra, así que hay que anotarlo a mano.
--
-- Esta tabla es voluntaria. Sin ella, las métricas de arriba describen el
-- proceso pero no demuestran la mejora.
-- =====================================================================

create table if not exists incidencias_obra (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null default current_date,
  proyecto_id  uuid references proyectos(id),
  viaje_id     uuid references viajes(id),
  tipo         text not null
               check (tipo in ('falta_bulto','bulto_equivocado','danio','otro')),
  bultos       int  not null default 1,
  hubo_regreso boolean not null default false,
  costo        numeric,          -- flete extra, horas perdidas, lo que aplique
  notas        text,
  created_at   timestamptz not null default now()
);

alter table incidencias_obra enable row level security;
drop policy if exists p_incidencias on incidencias_obra;
create policy p_incidencias on incidencias_obra for all using (true) with check (true);

-- Cómo se registra una:
--   insert into incidencias_obra (proyecto_id, tipo, bultos, hubo_regreso, notas)
--   values ('<uuid del proyecto>', 'falta_bulto', 2, true,
--           'faltaron dos frontales de gavetas, se llevaron al día siguiente');

-- Y el reporte que sale de ahí:
select
  date_trunc('month', fecha)::date            as mes,
  count(*)                                    as incidencias,
  sum(bultos)                                 as bultos_afectados,
  count(*) filter (where hubo_regreso)        as viajes_de_vuelta,
  coalesce(sum(costo), 0)                     as costo_total
from incidencias_obra
group by 1
order by 1 desc;
