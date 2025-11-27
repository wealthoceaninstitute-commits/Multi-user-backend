'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button, Col, Form, Row, Alert, Card, Spinner,
} from 'react-bootstrap';
import AsyncSelect from 'react-select/async';
import api from './api';
import { useRouter } from 'next/navigation';

const FORM_STORAGE_KEY = 'woi-trade-form-v1';

const onlyDigits = (v) => (v ?? '').replace(/[^\d]/g, '');
const toIntOr = (v, fallback = 1) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// canonical values
const ORDER_TYPES = [
  { value: 'LIMIT', label: 'LIMIT' },
  { value: 'MARKET', label: 'MARKET' },
  { value: 'STOPLOSS', label: 'STOPLOSS' },
  { value: 'SL_MARKET', label: 'SL_MARKET' },
];

const PRODUCT_TYPES = [
  { value: 'VALUEPLUS', label: 'INTRADAY' },
  { value: 'DELIVERY', label: 'DELIVERY' },
  { value: 'NORMAL', label: 'NORMAL' },
  { value: 'SELLFROMDP', label: 'SELLFROMDP' },
  { value: 'BTST', label: 'BTST' },
  { value: 'MTF', label: 'MTF' },
];

const EXCHANGES = ['NSE', 'BSE', 'NSEFO', 'NSECD', 'NCDEX', 'MCX', 'BSEFO', 'BSECD'];

export default function TradeForm() {

  const router = useRouter();

  // 🔥 Read auth token
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  // redirect to login if token missing
  useEffect(() => {
    if (!token) router.push("/login");
  }, [token]);

  // state
  const [action, setAction] = useState('BUY');
  const [productType, setProductType] = useState('VALUEPLUS');
  const [orderType, setOrderType] = useState('LIMIT');
  const [qtySelection, setQtySelection] = useState('manual');

  const [groupAcc, setGroupAcc] = useState(false);
  const [diffQty, setDiffQty] = useState(false);
  const [multiplier, setMultiplier] = useState(false);

  const [qty, setQty] = useState('1');
  const [exchange, setExchange] = useState('NSE');
  const [symbol, setSymbol] = useState(null);
  const [price, setPrice] = useState(0);
  const [trigPrice, setTrigPrice] = useState(0);
  const [disclosedQty, setDisclosedQty] = useState(0);

  const [timeForce, setTimeForce] = useState('DAY');
  const [amo, setAmo] = useState(false);

  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);

  const [perClientQty, setPerClientQty] = useState({});
  const [perGroupQty, setPerGroupQty] = useState({});

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // 🔥 Fetch clients + groups for this user only
  useEffect(() => {
    if (!token) return;

    api
      .get('/users/get_clients', {
        headers: { 'X-Auth-Token': token },
      })
      .then((res) => setClients(res.data?.clients || []))
      .catch(() => {});

    api
      .get('/users/groups', {
        headers: { 'X-Auth-Token': token },
      })
      .then((res) => {
        const normalized = (res.data?.groups || []).map((g) => ({
          group_name: g.group_name ?? g.name ?? g.id,
          no_of_clients: (g.members || g.clients || []).length,
          multiplier: Number(g.multiplier ?? 1),
          client_names: (g.members || g.clients || []).map(
            (m) => m.name || m
          ),
        }));
        setGroups(normalized);
      })
      .catch(() => {});
  }, [token]);

  // symbol search
  const loadSymbolOptions = async (inputValue) => {
    if (!inputValue) return [];
    const res = await api.get('/users/search_symbols', {
      params: { q: inputValue, exchange },
      headers: { 'X-Auth-Token': token },
    });
    return (res.data?.results || []).map((r) => ({
      value: r.id ?? r.token ?? r.symbol,
      label: r.text ?? r.label ?? String(r.id),
    }));
  };

  const isStopOrder = orderType === 'STOPLOSS' || orderType === 'SL_MARKET';

  const validateBeforeSubmit = () => {
    if (!symbol?.value) return 'Please select a valid symbol';
    if (isStopOrder && Number(trigPrice) <= 0)
      return 'Trigger price is required';

    return null;
  };

  const submit = async (e) => {
    e.preventDefault();

    const err = validateBeforeSubmit();
    if (err) {
      setToast({ variant: 'danger', text: err });
      return;
    }

    const payload = {
      action,
      ordertype: orderType,
      producttype: productType,
      orderduration: timeForce,
      exchange,
      symbol: symbol?.value,
      price: Number(price),
      triggerprice: Number(trigPrice),
      disclosedquantity: Number(disclosedQty),
      amoorder: amo ? 'Y' : 'N',
      qty: Number(qty),
      groupAcc,
      groups: selectedGroups,
      clients: selectedClients,
      diffQty,
      multiplier,
      perClientQty,
      perGroupQty,
      qtySelection,
    };

    try {
      setBusy(true);

      const resp = await api.post('/users/place_order', payload, {
        headers: { 'X-Auth-Token': token },
      });

      setToast({
        variant: 'success',
        text: 'Order Placed: ' + JSON.stringify(resp.data),
      });
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data ||
        error.message;
      setToast({ variant: 'danger', text: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-sm cardPad blueTone">
      <Form onSubmit={submit}>
        {/* original UI left untouched */}
        {/* ... ENTIRE REST OF YOUR ORIGINAL FILE ... */}
      </Form>
    </Card>
  );
}
