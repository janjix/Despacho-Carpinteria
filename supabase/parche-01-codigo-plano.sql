-- =====================================================================
-- Parche 01 · código de barras sin guiones
--
-- Ejecutar SOLO si ya corriste migracion.sql antes de este cambio.
-- Si vas a instalar desde cero, migracion.sql ya lo incluye y este
-- archivo sobra.
--
-- Motivo: el lector envía códigos de tecla, no caracteres. Con el lector
-- en distribución US y la tablet en latinoamericano, el guion llega como
-- comilla simple y el código deja de coincidir. Sacando el guion del
-- símbolo el problema desaparece.
-- =====================================================================

alter table items
  add column if not exists codigo_plano text generated always as
    (upper(regexp_replace(codigo, '[^A-Za-z0-9]', '', 'g'))) stored;

create unique index if not exists items_plano_uidx on items (codigo_plano);

create or replace function escanear(p_codigo text, p_modo text)
returns jsonb
language plpgsql
as $$
declare
  v_item      items%rowtype;
  v_plano     text := upper(regexp_replace(p_codigo, '[^A-Za-z0-9]', '', 'g'));
  v_resultado text;
begin
  if p_modo not in ('embalaje','carga') then
    raise exception 'Modo inválido: %', p_modo;
  end if;

  select * into v_item
    from items
   where codigo_plano = v_plano and deleted_at is null
     for update;

  if not found then
    insert into escaneos (codigo, accion, resultado)
    values (upper(trim(p_codigo)), p_modo, 'no_encontrado');
    return jsonb_build_object('resultado','no_encontrado','codigo',upper(trim(p_codigo)));
  end if;

  if p_modo = 'embalaje' then
    if v_item.estado = 'pendiente' then
      update items set estado = 'embalado', embalado_at = now()
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
    else
      v_resultado := 'duplicado';
    end if;
  else
    if v_item.estado = 'embalado' then
      update items set estado = 'cargado', cargado_at = now()
       where id = v_item.id returning * into v_item;
      v_resultado := 'ok';
    elsif v_item.estado = 'cargado' then
      v_resultado := 'duplicado';
    else
      v_resultado := 'fuera_de_orden';
    end if;
  end if;

  insert into escaneos (codigo, item_id, accion, resultado)
  values (v_item.codigo, v_item.id, p_modo, v_resultado);

  return jsonb_build_object('resultado', v_resultado, 'item', to_jsonb(v_item));
end;
$$;

-- Las etiquetas ya impresas siguen sirviendo: el símbolo viejo lleva
-- guiones y la función los ignora al comparar.
