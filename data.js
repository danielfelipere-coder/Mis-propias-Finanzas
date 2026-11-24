/* ============================================================================
   data.js — Modelo de Datos, Perfiles Pre-cargados y Motor Contable Exacto
   Mis Propias Finanzas · COP
   ============================================================================ */

(() => {
  'use strict';

  const STORAGE_KEY = 'mis_propias_finanzas_v5_modular';
  const SESSION_KEY = 'mis_propias_finanzas_session_active';

  const DEFAULT_TARGETS = {
    ahorro: 15,
    vivienda: 40,
    deuda: 20,
    personales: 35,
    proteccion: 10
  };

  const PILLAR_INFO = {
    ahorro:     { label: 'Ahorro',        pillClass: 'pill-mint',   color: '#00F5A0' },
    vivienda:   { label: 'Vivienda',      pillClass: 'pill-cyan',   color: '#00D9F5' },
    deuda:      { label: 'Deuda',         pillClass: 'pill-rose',   color: '#FF3366' },
    personales: { label: 'G. Personales', pillClass: 'pill-amber',  color: '#FFB800' },
    proteccion: { label: 'Protección',    pillClass: 'pill-purple', color: '#A855F7' }
  };

  const PATRIMONIO_CATEGORIES = [
    { id: 'inmuebles',   label: 'Inmuebles',                color: '#00D9F5', pillClass: 'pill-cyan' },
    { id: 'vehiculos',   label: 'Vehículos y Bienes',       color: '#3B82F6', pillClass: 'pill-cobalt' },
    { id: 'efectivo',    label: 'Efectivo / Cuentas',       color: '#00F5A0', pillClass: 'pill-mint' },
    { id: 'inversiones', label: 'Inversiones / Bonos',      color: '#A855F7', pillClass: 'pill-purple' },
    { id: 'cesantias',   label: 'Cesantías y Laborales',    color: '#14B8A6', pillClass: 'pill-mint' },
    { id: 'tarjetas',    label: 'Tarjetas de Crédito',      color: '#FFB800', pillClass: 'pill-amber' },
    { id: 'prestamos',   label: 'Préstamos y Otras Deudas', color: '#FF3366', pillClass: 'pill-rose' }
  ];

  // ==========================================================================
  // 1. UTILIDADES DE FORMATO COLOMBIANO (COP / %) Y VALIDACIÓN
  // ==========================================================================
  function normalizeCedula(raw) {
    return String(raw ?? '').replace(/\D+/g, '').trim();
  }

  function formatCedulaDisplay(cedula) {
    const clean = normalizeCedula(cedula);
    if (!clean) return '';
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatCOP(value, decimals = null) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '$ 0';
    const hasCents = Math.abs(num - Math.round(num)) > 0.004;
    const dec = decimals === null ? (hasCents ? 2 : 0) : decimals;
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    const fixed = abs.toFixed(dec);
    const [intPart, decPart] = fixed.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec > 0 ? `${sign}$ ${grouped},${decPart}` : `${sign}$ ${grouped}`;
  }

  function formatCOPShort(value) {
    const num = Number(value) || 0;
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1e9) return `${sign}$ ${(abs / 1e9).toFixed(2).replace('.', ',')}B`;
    if (abs >= 1e6) return `${sign}$ ${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace('.', ',')}M`;
    if (abs >= 1e3) return `${sign}$ ${Math.round(abs / 1e3)}K`;
    return `${sign}$ ${Math.round(abs)}`;
  }

  function formatPct(value, decimals = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0,00%';
    return `${num.toFixed(decimals).replace('.', ',')}%`;
  }

  function escapeAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getInitials(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'MF';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ==========================================================================
  // 2. PLANTILLA BASE DE 12 INGRESOS + 15 CATEGORÍAS (102 VARIABLES)
  // ==========================================================================
  function createEmptyFinancialData() {
    return {
      targets: { ...DEFAULT_TARGETS },
      incomesExpanded: true,
      incomes: [
        { id: 'inc-1',  name: 'Ingresos mensuales 1',  amount: 0, note: '' },
        { id: 'inc-2',  name: 'Ingresos mensuales 2',  amount: 0, note: '' },
        { id: 'inc-3',  name: 'Ingresos mensuales 3',  amount: 0, note: '' },
        { id: 'inc-4',  name: 'Ingresos mensuales 4',  amount: 0, note: '' },
        { id: 'inc-5',  name: 'Ingresos mensuales 5',  amount: 0, note: '' },
        { id: 'inc-6',  name: 'Ingresos mensuales 6',  amount: 0, note: '' },
        { id: 'inc-7',  name: 'Ingresos mensuales 7',  amount: 0, note: '' },
        { id: 'inc-8',  name: 'Ingresos mensuales 8',  amount: 0, note: '' },
        { id: 'inc-9',  name: 'Ingresos mensuales 9',  amount: 0, note: '' },
        { id: 'inc-10', name: 'Ingresos mensuales 10', amount: 0, note: '' },
        { id: 'inc-11', name: 'Ingresos mensuales 11', amount: 0, note: '' },
        { id: 'inc-12', name: 'Ingresos mensuales 12', amount: 0, note: '' }
      ],
      categories: [
        {
          id: 'ahorros', name: 'AHORROS', pillar: 'ahorro', color: '#00F5A0', expanded: true,
          items: [
            { id: 'ah-1', name: 'Ahorros 1', amount: 0, note: '' },
            { id: 'ah-2', name: 'Ahorros 2', amount: 0, note: '' },
            { id: 'ah-3', name: 'Ahorros 3', amount: 0, note: '' },
            { id: 'ah-4', name: 'Ahorros 4', amount: 0, note: '' },
            { id: 'ah-5', name: 'Ahorros 5', amount: 0, note: '' }
          ]
        },
        {
          id: 'propiedad1', name: 'PROPIEDAD 1', pillar: 'vivienda', color: '#00D9F5', expanded: false,
          items: [
            { id: 'p1-1', name: 'Hipoteca', amount: 0, note: '' },
            { id: 'p1-2', name: 'Impuestos', amount: 0, note: '' },
            { id: 'p1-3', name: 'Administración', amount: 0, note: '' },
            { id: 'p1-4', name: 'Mantenimiento', amount: 0, note: '' },
            { id: 'p1-5', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'propiedad2', name: 'PROPIEDAD 2', pillar: 'vivienda', color: '#3B82F6', expanded: false,
          items: [
            { id: 'p2-1', name: 'Hipoteca', amount: 0, note: '' },
            { id: 'p2-2', name: 'Impuestos', amount: 0, note: '' },
            { id: 'p2-3', name: 'Administración', amount: 0, note: '' },
            { id: 'p2-4', name: 'Mantenimiento', amount: 0, note: '' },
            { id: 'p2-5', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'servicios2', name: 'SERVICIOS PROPIEDAD 2', pillar: 'vivienda', color: '#0EA5E9', expanded: false,
          items: [
            { id: 's2-1', name: 'Electricidad', amount: 0, note: '' },
            { id: 's2-2', name: 'Agua', amount: 0, note: '' },
            { id: 's2-3', name: 'Gas', amount: 0, note: '' },
            { id: 's2-4', name: 'Teléfono', amount: 0, note: '' },
            { id: 's2-5', name: 'App Suscripciones', amount: 0, note: '' },
            { id: 's2-6', name: 'Internet / TV', amount: 0, note: '' },
            { id: 's2-7', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'servicios1', name: 'SERVICIOS PROPIEDAD 1', pillar: 'vivienda', color: '#38BDF8', expanded: false,
          items: [
            { id: 's1-1', name: 'Electricidad', amount: 0, note: '' },
            { id: 's1-2', name: 'Agua', amount: 0, note: '' },
            { id: 's1-3', name: 'Gas', amount: 0, note: '' },
            { id: 's1-4', name: 'Teléfono', amount: 0, note: '' },
            { id: 's1-5', name: 'App Suscripciones', amount: 0, note: '' },
            { id: 's1-6', name: 'Internet / TV', amount: 0, note: '' },
            { id: 's1-7', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'alimentacion', name: 'ALIMENTACIÓN', pillar: 'personales', color: '#FFB800', expanded: false,
          items: [
            { id: 'al-1', name: 'Mercados', amount: 0, note: '' },
            { id: 'al-2', name: 'Restaurantes', amount: 0, note: '' },
            { id: 'al-3', name: 'Gastos diarios Café / merienda', amount: 0, note: '' },
            { id: 'al-4', name: 'Servicio de aseo', amount: 0, note: '' },
            { id: 'al-5', name: 'Cigarros', amount: 0, note: '' },
            { id: 'al-6', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'transporte', name: 'TRANSPORTE', pillar: 'personales', color: '#FB923C', expanded: false,
          items: [
            { id: 'tr-1', name: 'Buses / trenes', amount: 0, note: '' },
            { id: 'tr-2', name: 'Cuota automóvil 1', amount: 0, note: '' },
            { id: 'tr-3', name: 'Cuota automóvil 2', amount: 0, note: '' },
            { id: 'tr-4', name: 'Gasolina', amount: 0, note: '' },
            { id: 'tr-5', name: 'Peajes', amount: 0, note: '' },
            { id: 'tr-6', name: 'Impuestos', amount: 0, note: '' },
            { id: 'tr-7', name: 'Mantenimiento', amount: 0, note: '' },
            { id: 'tr-8', name: 'Seguros', amount: 0, note: '' },
            { id: 'tr-9', name: 'Parqueadero', amount: 0, note: '' },
            { id: 'tr-10', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'hijos', name: 'HIJOS', pillar: 'personales', color: '#EC4899', expanded: false,
          items: [
            { id: 'hi-1', name: 'Colegio', amount: 0, note: '' },
            { id: 'hi-2', name: 'Matrícula escolar', amount: 0, note: '' },
            { id: 'hi-3', name: 'Actividades Extra', amount: 0, note: '' },
            { id: 'hi-4', name: 'Mesada', amount: 0, note: '' },
            { id: 'hi-5', name: 'Útiles escolares', amount: 0, note: '' },
            { id: 'hi-6', name: 'Regalos y fiestas', amount: 0, note: '' },
            { id: 'hi-7', name: 'Clases Extra', amount: 0, note: '' },
            { id: 'hi-8', name: 'Terapias / Otros', amount: 0, note: '' },
            { id: 'hi-9', name: 'Ayuda doméstica', amount: 0, note: '' },
            { id: 'hi-10', name: 'Transporte escolar', amount: 0, note: '' },
            { id: 'hi-11', name: 'Viajes escolares', amount: 0, note: '' },
            { id: 'hi-12', name: 'Cuota alimentaria (si aplica)', amount: 0, note: '' },
            { id: 'hi-13', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'salud', name: 'SALUD', pillar: 'personales', color: '#14B8A6', expanded: false,
          items: [
            { id: 'sa-1', name: 'Seguro médico', amount: 0, note: '' },
            { id: 'sa-2', name: 'Dentista', amount: 0, note: '' },
            { id: 'sa-3', name: 'Medicinas', amount: 0, note: '' },
            { id: 'sa-4', name: 'Pagos no cubiertos por seguro', amount: 0, note: '' },
            { id: 'sa-5', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'mascota', name: 'MASCOTA', pillar: 'personales', color: '#C084FC', expanded: false,
          items: [
            { id: 'ma-1', name: 'Seguro', amount: 0, note: '' },
            { id: 'ma-2', name: 'Comida', amount: 0, note: '' },
            { id: 'ma-3', name: 'Cuidados', amount: 0, note: '' },
            { id: 'ma-4', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'vestuario', name: 'VESTUARIO', pillar: 'personales', color: '#F472B6', expanded: false,
          items: [
            { id: 've-1', name: 'Uniformes Hijos', amount: 0, note: '' },
            { id: 've-2', name: 'Ropa Hijos', amount: 0, note: '' },
            { id: 've-3', name: 'Ropa Adultos', amount: 0, note: '' },
            { id: 've-4', name: 'Implementos Deportivos', amount: 0, note: '' },
            { id: 've-5', name: 'Salón de belleza', amount: 0, note: '' },
            { id: 've-6', name: 'Peluquería', amount: 0, note: '' },
            { id: 've-7', name: 'Cosméticos', amount: 0, note: '' },
            { id: 've-8', name: 'Otros', amount: 0, note: '' }
          ]
        },
        {
          id: 'otros_gastos', name: 'OTROS GASTOS', pillar: 'personales', color: '#F97316', expanded: false,
          items: [
            { id: 'og-1', name: 'Regalos y fiestas', amount: 0, note: '' },
            { id: 'og-2', name: 'Fiestas y celebraciones', amount: 0, note: '' },
            { id: 'og-3', name: 'Vacaciones', amount: 0, note: '' },
            { id: 'og-4', name: 'Ayuda a parientes', amount: 0, note: '' },
            { id: 'og-5', name: 'Ayuda a parientes', amount: 0, note: '' },
            { id: 'og-6', name: 'Donaciones', amount: 0, note: '' },
            { id: 'og-7', name: 'Hobbies / pasatiempos', amount: 0, note: '' },
            { id: 'og-8', name: 'Hobbies / pasatiempos', amount: 0, note: '' },
            { id: 'og-9', name: 'Gastos misceláneos', amount: 0, note: '' }
          ]
        },
        {
          id: 'seguros', name: 'SEGUROS', pillar: 'proteccion', color: '#A855F7', expanded: false,
          items: [
            { id: 'se-1', name: 'Seguro médico prepagado', amount: 0, note: '' },
            { id: 'se-2', name: 'Seguro dentista', amount: 0, note: '' },
            { id: 'se-3', name: 'Seguro de vida', amount: 0, note: '' },
            { id: 'se-4', name: 'Seguro mortuario', amount: 0, note: '' },
            { id: 'se-5', name: 'Otros Seguros', amount: 0, note: '' }
          ]
        },
        {
          id: 'nomina', name: 'DESCUENTO POR NÓMINA', pillar: 'deuda', color: '#FB7185', expanded: false,
          items: [
            { id: 'no-1', name: 'Descuento por nómina Salud', amount: 0, note: '' },
            { id: 'no-2', name: 'Descuento por nómina Pensión', amount: 0, note: '' },
            { id: 'no-3', name: 'Pensión solidaria + alimentación', amount: 0, note: '' },
            { id: 'no-4', name: 'Retención en la fuente', amount: 0, note: '' }
          ]
        },
        {
          id: 'deudas', name: 'DEUDAS', pillar: 'deuda', color: '#FF3366', expanded: false,
          items: [
            { id: 'de-1', name: 'Tarjeta crédito 1', amount: 0, note: '' },
            { id: 'de-2', name: 'Tarjeta crédito 2', amount: 0, note: '' },
            { id: 'de-3', name: 'Tarjeta crédito 3', amount: 0, note: '' },
            { id: 'de-4', name: 'Otra deuda 1', amount: 0, note: '' },
            { id: 'de-5', name: 'Otra deuda 2', amount: 0, note: '' },
            { id: 'de-6', name: 'Otra deuda 3', amount: 0, note: '' },
            { id: 'de-7', name: 'Otra deuda 4', amount: 0, note: '' },
            { id: 'de-8', name: 'Deudas con empresas', amount: 0, note: '' },
            { id: 'de-9', name: 'Deudas con empresas', amount: 0, note: '' }
          ]
        }
      ]
    };
  }

  // ==========================================================================
  // 3. DATOS AUDITADOS PRE-CARGADOS: DANIEL Y DANIELA
  // ==========================================================================
  function createDanielFinancialData() {
    const d = createEmptyFinancialData();
    d.incomes[6] = { id: 'inc-7', name: 'Ingresos mensuales 7', amount: 1240000, note: 'Pago alquiler apt la quinta' };
    d.incomes[7] = { id: 'inc-8', name: 'Ingresos mensuales 8', amount: 6753559, note: 'Pago Hitachi' };

    const setCat = (catId, expanded, updates) => {
      const cat = d.categories.find(c => c.id === catId);
      if (!cat) return;
      cat.expanded = expanded;
      updates.forEach(([idx, amount, note]) => {
        cat.items[idx].amount = amount;
        if (note !== undefined) cat.items[idx].note = note;
      });
    };

    setCat('ahorros', true, [[0, 521500, 'Proyecto de inversión en KUBO']]);
    setCat('propiedad1', true, [
      [0, 655000, 'Ciprés'],
      [1, 0, 'Predial mensual'],
      [2, 290000, 'Administración']
    ]);
    setCat('propiedad2', true, [
      [0, 1470000, 'El canon del apt de La Quinta'],
      [1, 0, 'Predial mensual'],
      [2, 190000, 'Administración']
    ]);
    setCat('alimentacion', true, [[1, 200000, '']]);
    setCat('transporte', true, [[3, 200000, '']]);
    setCat('mascota', true, [
      [0, 70000, 'Gastos veterinarios'],
      [1, 164000, 'Comida de Aurelio'],
      [2, 230000, 'Salida de Aurelio'],
      [3, 25000, 'Peluquería']
    ]);
    setCat('vestuario', true, [[5, 50000, '']]);
    setCat('otros_gastos', true, [
      [4, 370000, 'Pago servicio energía mamá'],
      [5, 375000, 'Gordita'],
      [7, 8333.33, 'Pago YouTube Premium']
    ]);
    setCat('seguros', true, [[0, 445000, 'Medicina prepagada']]);
    setCat('nomina', true, [
      [0, 462257, ''],
      [1, 245000, ''],
      [2, 182000, '']
    ]);
    setCat('deudas', true, [
      [4, 550000, 'Pago tarjeta'],
      [5, 623000, 'PAGO CARRO'],
      [6, 198000, 'Pago póliza carro']
    ]);

    return d;
  }

  function createDanielaFinancialData() {
    const d = createEmptyFinancialData();
    d.incomes[0] = { id: 'inc-1', name: 'Gobernación',  amount: 6200000, note: 'Ingreso mensual Gobernación' };
    d.incomes[1] = { id: 'inc-2', name: 'Colpensiones', amount: 2540000, note: 'Ingreso mensual Colpensiones' };

    const setCat = (catId, expanded, updates) => {
      const cat = d.categories.find(c => c.id === catId);
      if (!cat) return;
      cat.expanded = expanded;
      updates.forEach(([idx, amount, note]) => {
        cat.items[idx].amount = amount;
        if (note !== undefined) cat.items[idx].note = note;
      });
    };

    setCat('ahorros', true, [[0, 521500, 'Ahorro mensual']]);
    setCat('servicios1', true, [[6, 334000, 'Servicios Propiedad 1']]);
    setCat('alimentacion', true, [[0, 450000, 'Alimentación mensual']]);
    setCat('transporte', true, [[3, 440000, 'Transporte mensual']]);
    setCat('salud', true, [[0, 740000, 'Salud mensual']]);
    setCat('mascota', true, [[1, 773000, 'Gastos mensuales mascota']]);
    setCat('vestuario', true, [[5, 50000, 'Vestuario / cuidado personal']]);
    setCat('otros_gastos', true, [[8, 1109000, 'Otros gastos mensuales']]);
    setCat('nomina', true, [[0, 500000, 'Descuento por nómina']]);
    setCat('deudas', true, [[3, 2913000, 'Cuotas financieras mensuales']]);

    return d;
  }

  // ==========================================================================
  // 4. PLANTILLA Y DATOS AUDITADOS DE PATRIMONIO (FÓRMULA EXACTA: VALOR - DEUDA)
  // ==========================================================================
  function createEmptyPatrimonioData() {
    return [
      { id: 'pat-1',  category: 'inmuebles',   name: 'Inmueble 1',                      valor: 0, deuda: 0 },
      { id: 'pat-2',  category: 'inmuebles',   name: 'Inmueble 2',                      valor: 0, deuda: 0 },
      { id: 'pat-3',  category: 'inmuebles',   name: 'Inmueble 3',                      valor: 0, deuda: 0 },
      { id: 'pat-4',  category: 'vehiculos',   name: 'Automóvil 2',                     valor: 0, deuda: 0 },
      { id: 'pat-5',  category: 'vehiculos',   name: 'Muebles',                         valor: 0, deuda: 0 },
      { id: 'pat-6',  category: 'vehiculos',   name: 'Joyas',                           valor: 0, deuda: 0 },
      { id: 'pat-7',  category: 'vehiculos',   name: 'Arte',                            valor: 0, deuda: 0 },
      { id: 'pat-8',  category: 'efectivo',    name: 'Efectivo cuenta 1',               valor: 0, deuda: 0 },
      { id: 'pat-9',  category: 'efectivo',    name: 'Efectivo cuenta 2',               valor: 0, deuda: 0 },
      { id: 'pat-10', category: 'efectivo',    name: 'Deudas por cobrar',               valor: 0, deuda: 0 },
      { id: 'pat-11', category: 'inversiones', name: 'Acciones',                        valor: 0, deuda: 0 },
      { id: 'pat-12', category: 'inversiones', name: 'Bonos o Títulos valores',         valor: 0, deuda: 0 },
      { id: 'pat-13', category: 'cesantias',   name: 'Fondos de retiro (Cesantías)',    valor: 0, deuda: 0 },
      { id: 'pat-14', category: 'cesantias',   name: 'Bonos o Derechos Laborales',      valor: 0, deuda: 0 },
      { id: 'pat-15', category: 'tarjetas',    name: 'Tarjeta de crédito 1 Davivienda', valor: 0, deuda: 0 },
      { id: 'pat-16', category: 'tarjetas',    name: 'Tarjeta de crédito 2 Rappi',      valor: 0, deuda: 0 },
      { id: 'pat-17', category: 'tarjetas',    name: 'Tarjeta de crédito 3',            valor: 0, deuda: 0 },
      { id: 'pat-18', category: 'prestamos',   name: 'Otra deuda 1',                    valor: 0, deuda: 0 },
      { id: 'pat-19', category: 'prestamos',   name: 'Otra deuda 2 (Davivienda)',       valor: 0, deuda: 0 },
      { id: 'pat-20', category: 'prestamos',   name: 'Otra deuda 3 (STM)',              valor: 0, deuda: 0 },
      { id: 'pat-21', category: 'prestamos',   name: 'Otra deuda 4 (Ángela)',           valor: 0, deuda: 0 },
      { id: 'pat-22', category: 'prestamos',   name: 'Otra deuda 5',                    valor: 0, deuda: 0 },
      { id: 'pat-23', category: 'prestamos',   name: 'Otros (Préstamos)',               valor: 0, deuda: 0 },
      { id: 'pat-24', category: 'prestamos',   name: 'Otros 1',                         valor: 0, deuda: 0 },
      { id: 'pat-25', category: 'prestamos',   name: 'Otros 2',                         valor: 0, deuda: 0 },
      { id: 'pat-26', category: 'prestamos',   name: 'Otros 3',                         valor: 0, deuda: 0 }
    ];
  }

  function createDanielPatrimonioData() {
    const items = createEmptyPatrimonioData();
    const map = {
      'pat-1':  [275000000, 110000000],
      'pat-2':  [195000000, 145000000],
      'pat-3':  [68750000,  240963350],
      'pat-5':  [9000000,   0],
      'pat-8':  [54000000,  0],
      'pat-10': [700000,    0],
      'pat-12': [1100000,   0],
      'pat-15': [1880000,   2220000],
      'pat-16': [8000000,   0],
      'pat-20': [0,         2900000],
      'pat-23': [4000000,   0]
    };
    items.forEach(item => {
      if (map[item.id]) {
        item.valor = map[item.id][0];
        item.deuda = map[item.id][1];
      }
    });
    return items;
  }

  function createDefaultState() {
    const danielCedula = '1010101010';
    const danielaCedula = '2020202020';

    return {
      activeTab: 'dashboard',
      activeCedula: danielCedula,
      activeGroupId: 'grp-hogar-daniel-daniela',
      onlyActiveVars: false,
      patrimonioScope: 'personal',
      patrimonioCategoryFilter: 'all',
      dailyScope: 'personal',
      dailyFilterMonth: 'all',
      dailyFilterCategory: 'all',
      profiles: {
        [danielCedula]: {
          cedula: danielCedula,
          name: 'Daniel',
          preset: 'daniel',
          color: '#00F5A0',
          createdAt: '2026-11-22',
          data: createDanielFinancialData(),
          patrimonio: createDanielPatrimonioData(),
          dailyExpenses: []
        },
        [danielaCedula]: {
          cedula: danielaCedula,
          name: 'Daniela',
          preset: 'daniela',
          color: '#00D9F5',
          createdAt: '2026-11-22',
          data: createDanielaFinancialData(),
          patrimonio: createEmptyPatrimonioData(),
          dailyExpenses: []
        }
      },
      groups: {
        'grp-hogar-daniel-daniela': {
          id: 'grp-hogar-daniel-daniela',
          name: 'Hogar Daniel y Daniela',
          memberCedulas: [danielCedula, danielaCedula],
          targets: { ...DEFAULT_TARGETS },
          createdAt: '2026-11-22'
        }
      }
    };
  }

  const PROFILE_COLORS = [
    '#00F5A0', '#00D9F5', '#A855F7', '#FFB800', '#3B82F6',
    '#EC4899', '#14B8A6', '#FB923C', '#C084FC', '#38BDF8',
    '#F472B6', '#F97316'
  ];

  function pickProfileColor(existingCount) {
    return PROFILE_COLORS[existingCount % PROFILE_COLORS.length];
  }

  // ==========================================================================
  // 5. MOTOR CONTABLE EXACTO (100% COHERENTE CON FÓRMULAS EXCEL)
  // ==========================================================================
  function computeMetrics(data) {
    const totalIncome = data.incomes.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const activeIncomes = data.incomes.filter(r => (Number(r.amount) || 0) > 0).length;

    const catTotals = {};
    let totalExpenses = 0;
    let totalVars = 0;
    let activeVars = 0;

    data.categories.forEach(cat => {
      let sum = 0;
      cat.items.forEach(item => {
        const amt = Number(item.amount) || 0;
        sum += amt;
        totalVars++;
        if (amt > 0) activeVars++;
      });
      catTotals[cat.id] = sum;
      totalExpenses += sum;
    });

    const freeCashFlow = totalIncome - totalExpenses;
    const pct = (val) => (totalIncome > 0 ? (val / totalIncome) * 100 : 0);

    const committedPct = pct(totalExpenses);
    const freePct = pct(freeCashFlow);

    const ahorroAmt = catTotals.ahorros || 0;
    const viviendaAmt = (catTotals.propiedad1 || 0) + (catTotals.propiedad2 || 0) +
                        (catTotals.servicios2 || 0) + (catTotals.servicios1 || 0);
    const nominaAmt = catTotals.nomina || 0;
    const deudasAmt = catTotals.deudas || 0;
    const deudaTotalAmt = nominaAmt + deudasAmt;
    const personalesAmt = (catTotals.alimentacion || 0) + (catTotals.transporte || 0) +
                          (catTotals.hijos || 0) + (catTotals.salud || 0) +
                          (catTotals.mascota || 0) + (catTotals.vestuario || 0) +
                          (catTotals.otros_gastos || 0);
    const proteccionAmt = catTotals.seguros || 0;

    const targets = data.targets || { ...DEFAULT_TARGETS };

    const pillars = [
      {
        id: 'ahorro',
        title: '1. Ahorro e Inversión',
        shortLines: ['Ahorro e', 'Inversión'],
        legendName: 'Ahorro',
        catsLabel: 'AHORROS',
        amount: ahorroAmt,
        realPct: pct(ahorroAmt),
        meta: Number(targets.ahorro),
        op: '≥',
        color: '#00F5A0',
        isGood: totalIncome > 0 && pct(ahorroAmt) >= Number(targets.ahorro)
      },
      {
        id: 'vivienda',
        title: '2. Vivienda',
        shortLines: ['Vivienda', ''],
        legendName: 'Vivienda',
        catsLabel: 'Propiedad 1 + Propiedad 2 + Servicios',
        amount: viviendaAmt,
        realPct: pct(viviendaAmt),
        meta: Number(targets.vivienda),
        op: '<',
        color: '#00D9F5',
        isGood: totalIncome > 0 && pct(viviendaAmt) < Number(targets.vivienda)
      },
      {
        id: 'deuda',
        title: '3. Deuda',
        shortLines: ['Deuda', ''],
        legendName: 'Deuda',
        catsLabel: `Cuotas (${formatPct(pct(deudasAmt))}) + Nómina (${formatPct(pct(nominaAmt))})`,
        amount: deudaTotalAmt,
        realPct: pct(deudaTotalAmt),
        meta: Number(targets.deuda),
        op: '<',
        color: '#FF3366',
        isGood: totalIncome > 0 && pct(deudaTotalAmt) < Number(targets.deuda),
        nominaAmt,
        deudasAmt,
        nominaPct: pct(nominaAmt),
        deudasPct: pct(deudasAmt)
      },
      {
        id: 'personales',
        title: '4. Gastos Personales',
        shortLines: ['Gastos', 'Personales'],
        legendName: 'G. Personales',
        catsLabel: 'Alim, Transp, Hijos, Salud, Mascota, Vest, Otros',
        amount: personalesAmt,
        realPct: pct(personalesAmt),
        meta: Number(targets.personales),
        op: '<',
        color: '#FFB800',
        isGood: totalIncome > 0 && pct(personalesAmt) < Number(targets.personales)
      },
      {
        id: 'proteccion',
        title: '5. Protección',
        shortLines: ['Protección', ''],
        legendName: 'Protección',
        catsLabel: 'SEGUROS',
        amount: proteccionAmt,
        realPct: pct(proteccionAmt),
        meta: Number(targets.proteccion),
        op: '>',
        color: '#A855F7',
        isGood: totalIncome > 0 && pct(proteccionAmt) > Number(targets.proteccion)
      }
    ];

    pillars.forEach(p => {
      p.metaAmount = (p.meta / 100) * totalIncome;
      if (p.op === '≥' || p.op === '>') {
        p.gapCOP = p.metaAmount - p.amount;
      } else {
        p.gapCOP = p.amount - p.metaAmount;
      }
    });

    const passedCount = pillars.filter(p => p.isGood).length;

    let score = 0;
    if (totalIncome > 0) {
      pillars.forEach(p => {
        if (p.isGood) {
          score += 17;
        } else {
          let ratio = 0;
          if (p.op === '≥' || p.op === '>') {
            ratio = p.meta > 0 ? Math.min(1, p.realPct / p.meta) : 0;
          } else {
            ratio = p.realPct > 0 ? Math.min(1, p.meta / p.realPct) : 0;
          }
          score += Math.round(17 * Math.max(0.15, ratio));
        }
      });
      if (freeCashFlow > 0) {
        score += Math.min(15, Math.round((freePct / 10) * 15));
      }
    }
    score = Math.max(0, Math.min(100, score));

    return {
      totalIncome,
      activeIncomes,
      totalExpenses,
      freeCashFlow,
      committedPct,
      freePct,
      catTotals,
      totalVars,
      activeVars,
      pillars,
      passedCount,
      score
    };
  }

  function getPillarGapText(p) {
    if (p.op === '≥') {
      if (p.isGood) return `Superas la meta en ${formatCOP(Math.abs(p.gapCOP))}`;
      return `Te faltan ${formatCOP(Math.max(0, p.gapCOP))} para llegar al ${p.meta}%`;
    }
    if (p.op === '>') {
      if (p.isGood) return `Superas la meta en ${formatCOP(Math.abs(p.gapCOP))}`;
      return `Te faltan ${formatCOP(Math.max(0, p.gapCOP))} para superar el ${p.meta}%`;
    }
    if (p.isGood) return `Margen disponible: ${formatCOP(Math.abs(p.gapCOP))}`;
    return `Excedes la meta en ${formatCOP(Math.max(0, p.gapCOP))}`;
  }

  // ==========================================================================
  // 6. MOTOR CONTABLE DE PATRIMONIO (SIN VALOR ABSOLUTO: VALOR - DEUDA)
  // ==========================================================================
  function computePatrimonioMetrics(items) {
    const list = Array.isArray(items) ? items : [];
    let totalActivos = 0;
    let totalDeudas = 0;
    let totalNeto = 0;
    let activeRows = 0;

    const byCategory = {};
    PATRIMONIO_CATEGORIES.forEach(c => {
      byCategory[c.id] = {
        id: c.id,
        label: c.label,
        color: c.color,
        pillClass: c.pillClass,
        activos: 0,
        deudas: 0,
        neto: 0,
        count: 0
      };
    });

    const rows = list.map(item => {
      const valor = Number(item.valor) || 0;
      const deuda = Number(item.deuda) || 0;
      // Fórmula exacta por fila sin valor absoluto: las deudas siempre restan
      const neto = valor - deuda;
      totalActivos += valor;
      totalDeudas += deuda;
      totalNeto += neto;
      if (valor !== 0 || deuda !== 0) activeRows++;

      const catKey = byCategory[item.category] ? item.category : 'prestamos';
      byCategory[catKey].activos += valor;
      byCategory[catKey].deudas += deuda;
      byCategory[catKey].neto += neto;
      byCategory[catKey].count += 1;

      return { ...item, valor, deuda, neto };
    });

    const debtRatioPct = totalActivos > 0 ? (totalDeudas / totalActivos) * 100 : (totalDeudas > 0 ? 100 : 0);
    const equityRatioPct = totalActivos > 0 ? (totalNeto / totalActivos) * 100 : 0;

    return {
      rows,
      totalActivos,
      totalDeudas,
      patrimonioNeto: totalNeto,
      debtRatioPct,
      equityRatioPct,
      activeRows,
      totalRows: rows.length,
      byCategory,
      categoryList: PATRIMONIO_CATEGORIES.map(c => byCategory[c.id])
    };
  }

  // ==========================================================================
  // 7. MOTOR DE CONSOLIDACIÓN DE GRUPO FAMILIAR ("GASTOS DEL HOGAR")
  // ==========================================================================
  function computeGroupConsolidated(group, profilesMap) {
    if (!group || !Array.isArray(group.memberCedulas)) return null;

    const members = group.memberCedulas
      .map(ced => profilesMap[ced])
      .filter(Boolean);

    if (members.length === 0) return null;

    const baseTemplate = createEmptyFinancialData();
    baseTemplate.targets = { ...(group.targets || DEFAULT_TARGETS) };
    baseTemplate.incomes = [];

    const memberSummaries = members.map(prof => {
      const metrics = computeMetrics(prof.data);
      const patMetrics = computePatrimonioMetrics(prof.patrimonio);

      prof.data.incomes.forEach(inc => {
        if ((Number(inc.amount) || 0) > 0) {
          baseTemplate.incomes.push({
            id: `${prof.cedula}-${inc.id}`,
            name: `${prof.name} · ${inc.name}`,
            amount: Number(inc.amount) || 0,
            note: inc.note || ''
          });
        }
      });

      return {
        cedula: prof.cedula,
        name: prof.name,
        color: prof.color || '#00D9F5',
        metrics,
        patrimonio: patMetrics
      };
    });

    // Sumar egresos por cada una de las 15 categorías exactas
    baseTemplate.categories.forEach(targetCat => {
      targetCat.items = members.map(prof => {
        const srcCat = prof.data.categories.find(c => c.id === targetCat.id);
        const catSum = srcCat
          ? srcCat.items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
          : 0;
        return {
          id: `${prof.cedula}-${targetCat.id}`,
          name: `${prof.name} · ${targetCat.name}`,
          amount: catSum,
          note: `Aporte ${prof.name}`
        };
      });
    });

    const consolidatedMetrics = computeMetrics(baseTemplate);

    // Consolidado de Patrimonio Familiar
    const allPatrimonioRows = [];
    members.forEach(prof => {
      (prof.patrimonio || []).forEach(row => {
        allPatrimonioRows.push({
          ...row,
          ownerName: prof.name,
          ownerCedula: prof.cedula
        });
      });
    });
    const consolidatedPatrimonio = computePatrimonioMetrics(allPatrimonioRows);

    // Calcular aportes porcentuales por integrante
    const enrichedMembers = memberSummaries.map(ms => {
      const incShare = consolidatedMetrics.totalIncome > 0
        ? (ms.metrics.totalIncome / consolidatedMetrics.totalIncome) * 100
        : 0;
      const expShare = consolidatedMetrics.totalExpenses > 0
        ? (ms.metrics.totalExpenses / consolidatedMetrics.totalExpenses) * 100
        : 0;
      const freeShare = consolidatedMetrics.freeCashFlow !== 0
        ? (ms.metrics.freeCashFlow / consolidatedMetrics.freeCashFlow) * 100
        : 0;
      const patShare = consolidatedPatrimonio.totalActivos > 0
        ? (ms.patrimonio.totalActivos / consolidatedPatrimonio.totalActivos) * 100
        : 0;

      return {
        ...ms,
        incomeSharePct: incShare,
        expenseSharePct: expShare,
        freeSharePct: freeShare,
        assetsSharePct: patShare
      };
    });

    return {
      group,
      consolidatedData: baseTemplate,
      metrics: consolidatedMetrics,
      patrimonio: consolidatedPatrimonio,
      members: enrichedMembers
    };
  }

  function futureValueMonthly(monthlyPmt, months, annualRateEA) {
    const pmt = Math.max(0, Number(monthlyPmt) || 0);
    if (months <= 0 || pmt <= 0) return 0;
    const r = Math.pow(1 + (Number(annualRateEA) || 0) / 100, 1 / 12) - 1;
    if (r === 0) return pmt * months;
    return pmt * ((Math.pow(1 + r, months) - 1) / r);
  }

  // ==========================================================================
  // 8. CONTROL DIARIO (TIPO EXCEL): PARSER DE VOZ/TEXTO, BORRADO Y MATRIZ
  // ==========================================================================
  const MONTHS_ES = [
    { num: 1,  short: 'Ene', full: 'Enero',      aliases: ['enero', 'ene'] },
    { num: 2,  short: 'Feb', full: 'Febrero',    aliases: ['febrero', 'feb'] },
    { num: 3,  short: 'Mar', full: 'Marzo',      aliases: ['marzo', 'mar'] },
    { num: 4,  short: 'Abr', full: 'Abril',      aliases: ['abril', 'abr'] },
    { num: 5,  short: 'May', full: 'Mayo',       aliases: ['mayo', 'may'] },
    { num: 6,  short: 'Jun', full: 'Junio',      aliases: ['junio', 'jun'] },
    { num: 7,  short: 'Jul', full: 'Julio',      aliases: ['julio', 'jul'] },
    { num: 8,  short: 'Ago', full: 'Agosto',     aliases: ['agosto', 'ago'] },
    { num: 9,  short: 'Sep', full: 'Septiembre', aliases: ['septiembre', 'setiembre', 'sept', 'sep'] },
    { num: 10, short: 'Oct', full: 'Octubre',    aliases: ['octubre', 'oct'] },
    { num: 11, short: 'Nov', full: 'Noviembre',  aliases: ['noviembre', 'nov'] },
    { num: 12, short: 'Dic', full: 'Diciembre',  aliases: ['diciembre', 'dic'] }
  ];

  function normalizeText(raw) {
    return String(raw ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getMonthMeta(monthNum) {
    const idx = Math.max(1, Math.min(12, Math.round(Number(monthNum) || 1))) - 1;
    return MONTHS_ES[idx];
  }

  // Palabras clave para clasificar automáticamente en las 15 categorías exactas del modelo
  const DAILY_CATEGORY_RULES = [
    {
      id: 'servicios2',
      keywords: [
        'servicios propiedad 2', 'servicio propiedad 2', 'servicios quinta', 'servicio quinta',
        'luz quinta', 'agua quinta', 'gas quinta', 'internet quinta', 'energia quinta', 'telefono quinta'
      ]
    },
    {
      id: 'propiedad2',
      keywords: [
        'propiedad 2', 'la quinta', 'quinta', 'apto 2', 'apartamento 2', 'canon quinta',
        'administracion quinta', 'hipoteca quinta', 'predial quinta'
      ]
    },
    {
      id: 'propiedad1',
      keywords: [
        'propiedad 1', 'hipoteca', 'cipres', 'administracion', 'predial', 'arriendo', 'alquiler',
        'canon', 'mantenimiento casa', 'mantenimiento apartamento', 'reparacion casa', 'plomero', 'electricista'
      ]
    },
    {
      id: 'servicios1',
      keywords: [
        'servicios propiedad 1', 'servicios', 'electricidad', 'energia', 'luz', 'acueducto', 'agua',
        'gas natural', 'pipeta', 'telefono', 'celular', 'plan movil', 'datos moviles', 'internet',
        'wifi', 'television', 'tv', 'netflix', 'spotify', 'youtube', 'disney', 'amazon prime',
        'icloud', 'suscripcion', 'suscripciones', 'app suscripciones', 'chatgpt', 'claude'
      ]
    },
    {
      id: 'ahorros',
      keywords: [
        'ahorro', 'ahorros', 'inversion', 'invertir', 'kubo', 'cdt', 'fiducia', 'fondo', 'etf',
        'acciones', 'bono', 'alcancia', 'ahorro programado', 'tyba', 'trii', 'bolsillo'
      ]
    },
    {
      id: 'alimentacion',
      keywords: [
        'alimentacion', 'mercado', 'mercados', 'supermercado', 'd1', 'ara', 'exito', 'jumbo',
        'carulla', 'olimpica', 'alkosto', 'makro', 'price smart', 'pricesmart', 'justo y bueno',
        'fruver', 'frutas', 'verduras', 'carne', 'carniceria', 'pollo', 'pescado', 'panaderia', 'pan',
        'restaurante', 'restaurantes', 'almuerzo', 'cena', 'desayuno', 'comida', 'domicilio', 'domicilios',
        'rappi', 'cafe', 'tinto', 'merienda', 'helado', 'pizza', 'hamburguesa', 'sushi', 'corrientazo',
        'servicio de aseo', 'aseo', 'cigarros', 'cigarrillos', 'licor', 'cerveza'
      ]
    },
    {
      id: 'transporte',
      keywords: [
        'transporte', 'gasolina', 'combustible', 'acpm', 'tanqueo', 'tanqueada', 'estacion de servicio',
        'terpel', 'primax', 'texaco', 'biomax', 'bus', 'buses', 'buseta', 'transmilenio', 'sitp',
        'metro', 'tren', 'pasaje', 'pasajes', 'uber', 'didi', 'indriver', 'cabify', 'taxi',
        'peaje', 'peajes', 'parqueadero', 'parqueo', 'estacionamiento', 'lavado carro', 'lavadero',
        'mantenimiento carro', 'taller', 'llantas', 'aceite carro', 'soat', 'tecnomecanica',
        'impuesto carro', 'impuesto vehiculo', 'automovil', 'carro', 'moto', 'bicicleta'
      ]
    },
    {
      id: 'hijos',
      keywords: [
        'hijos', 'hijo', 'hija', 'colegio', 'escuela', 'jardin', 'guarderia', 'matricula',
        'pension colegio', 'pension escolar', 'utiles', 'utiles escolares', 'mesada',
        'transporte escolar', 'ruta escolar', 'viaje escolar', 'clases extra', 'actividades extra',
        'cuota alimentaria', 'ninera', 'ayuda domestica', 'panales', 'juguete', 'juguetes'
      ]
    },
    {
      id: 'salud',
      keywords: [
        'salud', 'medico', 'doctor', 'cita medica', 'consulta', 'dentista', 'odontologo', 'odontologia',
        'medicina', 'medicinas', 'medicamento', 'medicamentos', 'farmacia', 'drogueria', 'cruz verde',
        'farmatodo', 'colsubsidio', 'examen', 'examenes', 'laboratorio', 'optica', 'gafas', 'lentes',
        'terapia', 'psicologo', 'fisioterapia', 'eps', 'copago', 'cuota moderadora', 'clinica', 'hospital'
      ]
    },
    {
      id: 'mascota',
      keywords: [
        'mascota', 'mascotas', 'perro', 'gato', 'aurelio', 'veterinario', 'veterinaria', 'concentrado',
        'cuido', 'comida perro', 'comida gato', 'arena gato', 'peluqueria perro', 'bano perro',
        'guarderia mascota', 'paseador', 'paseo perro', 'vacuna perro', 'desparasitante'
      ]
    },
    {
      id: 'vestuario',
      keywords: [
        'vestuario', 'ropa', 'zapatos', 'tenis', 'camisa', 'camiseta', 'pantalon', 'jean', 'chaqueta',
        'vestido', 'medias', 'ropa interior', 'uniforme', 'uniformes', 'deportivo', 'implementos deportivos',
        'peluqueria', 'barberia', 'corte de pelo', 'corte cabello', 'salon de belleza', 'manicure',
        'pedicure', 'unas', 'cosmeticos', 'maquillaje', 'perfume', 'crema', 'shampoo', 'tintoreria', 'lavanderia'
      ]
    },
    {
      id: 'seguros',
      keywords: [
        'seguros', 'seguro', 'prepagada', 'medicina prepagada', 'colsanitas', 'sura', 'coomeva',
        'poliza', 'seguro de vida', 'seguro medico', 'seguro dentista', 'seguro mortuario', 'exequial',
        'funerario', 'seguro hogar', 'seguro todo riesgo'
      ]
    },
    {
      id: 'nomina',
      keywords: [
        'descuento por nomina', 'descuento nomina', 'nomina', 'retencion en la fuente', 'retencion',
        'pension solidaria', 'descuento salud', 'descuento pension', 'retefuente', 'libranza'
      ]
    },
    {
      id: 'deudas',
      keywords: [
        'deudas', 'deuda', 'tarjeta de credito', 'tarjeta credito', 'tarjeta', 'cuota', 'cuotas',
        'prestamo', 'credito', 'banco', 'davivienda', 'bancolombia', 'nu', 'rappicard', 'bbva',
        'bogota', 'occidente', 'av villas', 'pago carro', 'cuota carro', 'interes', 'intereses',
        'abono deuda', 'pago tarjeta', 'poliza carro'
      ]
    },
    {
      id: 'otros_gastos',
      keywords: [
        'otros gastos', 'regalo', 'regalos', 'fiesta', 'fiestas', 'celebracion', 'cumpleanos',
        'vacaciones', 'viaje', 'vuelo', 'tiquete', 'hotel', 'airbnb', 'ayuda', 'mama', 'papa',
        'parientes', 'familia', 'donacion', 'donaciones', 'iglesia', 'diezmo', 'hobby', 'hobbies',
        'pasatiempo', 'cine', 'concierto', 'teatro', 'entretenimiento', 'gimnasio', 'gym',
        'miscelaneos', 'varios', 'gordita', 'propina'
      ]
    }
  ];

  // Conversión de números hablados en español (colombiano) a número
  const SP_UNITS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
    veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
    veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29
  };

  const SP_TENS = {
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
    setenta: 70, ochenta: 80, noventa: 90
  };

  const SP_HUNDREDS = {
    cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
    trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
    quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
    setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
    novecientos: 900, novecientas: 900
  };

  const SP_ORDINALS = {
    primera: 1, primero: 1, primer: 1,
    segunda: 2, segundo: 2,
    tercera: 3, tercero: 3, tercer: 3,
    cuarta: 4, cuarto: 4,
    quinta: 5, quinto: 5,
    sexta: 6, sexto: 6,
    septima: 7, septimo: 7,
    octava: 8, octavo: 8,
    novena: 9, noveno: 9,
    decima: 10, decimo: 10
  };

  function parseSmallSpanishInt(tokenRaw) {
    const t = normalizeText(tokenRaw);
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (SP_ORDINALS[t] !== undefined) return SP_ORDINALS[t];
    if (SP_UNITS[t] !== undefined) return SP_UNITS[t];
    if (SP_TENS[t] !== undefined) return SP_TENS[t];
    if (SP_HUNDREDS[t] !== undefined) return SP_HUNDREDS[t];
    const parts = t.split(/\s+/).filter(w => w !== 'y');
    let total = 0;
    let found = false;
    for (const w of parts) {
      if (SP_HUNDREDS[w] !== undefined) { total += SP_HUNDREDS[w]; found = true; }
      else if (SP_TENS[w] !== undefined) { total += SP_TENS[w]; found = true; }
      else if (SP_UNITS[w] !== undefined) { total += SP_UNITS[w]; found = true; }
      else return null;
    }
    return found ? total : null;
  }

  function parseNumericTokenCOP(rawNum) {
    let s = String(rawNum || '').trim();
    if (!s) return NaN;
    // Ejemplos: 450.000, 1.250.000, 1.250.000,50, 450,000, 1.5, 1,5
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
      s = s.replace(/,/g, '');
    } else if (/^\d+,\d{1,2}$/.test(s)) {
      s = s.replace(',', '.');
    } else if (/^\d+\.\d{3}$/.test(s)) {
      s = s.replace('.', '');
    }
    return parseFloat(s);
  }

  function parseColombianAmount(rawText) {
    const norm = normalizeText(rawText);

    // 1. "medio millón"
    const halfMil = norm.match(/\bmedio\s+millon(?:es)?(?:\s+de)?(?:\s+pesos)?\b/);
    if (halfMil) {
      return { amount: 500000, matchedText: halfMil[0] };
    }

    // 2. Patrón compuesto: "1 millón 200 mil", "2 millones 500 mil"
    const compMil = norm.match(/(?:\$\s*)?(\d+(?:[.,]\d+)?)\s*millon(?:es)?\s+(?:y\s+)?(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b(?:\s*(?:de\s+)?pesos)?/);
    if (compMil) {
      const m1 = parseNumericTokenCOP(compMil[1]);
      const m2 = parseNumericTokenCOP(compMil[2]);
      if (Number.isFinite(m1) && Number.isFinite(m2)) {
        return { amount: Math.round(m1 * 1000000 + m2 * 1000), matchedText: compMil[0] };
      }
    }

    // 3. Número + multiplicador ("200 mil", "1.5 millones", "450k", "$ 200 mil pesos")
    const numMult = norm.match(/(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mil|k|m)\b(?:\s*(?:de\s+)?pesos)?/);
    if (numMult) {
      const base = parseNumericTokenCOP(numMult[1]);
      const unit = numMult[2];
      if (Number.isFinite(base)) {
        let mult = 1;
        if (unit === 'mil' || unit === 'k') mult = 1000;
        else if (unit === 'millon' || unit === 'millones' || unit === 'm') mult = 1000000;
        return { amount: Math.round(base * mult * 100) / 100, matchedText: numMult[0] };
      }
    }

    // 4. Número directo en pesos o con separador de miles ("450.000 pesos", "$450.000", "450000", "85.500")
    // Evita capturar fechas tipo 2026-09-15 o 15/09 o "fila 3"
    const scrubbed = norm
      .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
      .replace(/\b(?:el\s+)?\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, ' ')
      .replace(/\b(?:fila|linea|registro|numero|num|propiedad|servicios|tarjeta|cuota|automovil|auto|deuda)\s+\d+\b/g, ' ');

    const directNum = scrubbed.match(/(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{3,}(?:[.,]\d{1,2})?)(?:\s*(?:cop|pesos))?\b/);
    if (directNum) {
      const val = parseNumericTokenCOP(directNum[1]);
      if (Number.isFinite(val) && val > 0) {
        return { amount: Math.round(val * 100) / 100, matchedText: directNum[0] };
      }
    }

    // 5. Número pequeño explícitamente acompañado de "pesos" o "$" ("$ 50", "50 pesos")
    const smallCurrency = scrubbed.match(/(?:\$\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:cop|pesos)\b)/);
    if (smallCurrency) {
      const val = parseNumericTokenCOP(smallCurrency[1] || smallCurrency[2]);
      if (Number.isFinite(val) && val > 0) {
        return { amount: Math.round(val * 100) / 100, matchedText: smallCurrency[0] };
      }
    }

    // 6. Números hablados en español ("doscientos mil", "cuatrocientos cincuenta mil pesos", "un millón quinientos mil")
    const wordTokens = norm.split(/\s+/);
    let bestStart = -1;
    let bestEnd = -1;
    let bestAmount = 0;

    const isNumWord = (w) => (
      w === 'y' || w === 'mil' || w === 'millon' || w === 'millones' ||
      w === 'pesos' || w === 'de' ||
      SP_UNITS[w] !== undefined || SP_TENS[w] !== undefined || SP_HUNDREDS[w] !== undefined
    );

    let i = 0;
    while (i < wordTokens.length) {
      const w = wordTokens[i];
      const startsNum = (
        SP_UNITS[w] !== undefined || SP_TENS[w] !== undefined || SP_HUNDREDS[w] !== undefined || w === 'mil'
      );
      if (!startsNum) { i++; continue; }

      let j = i;
      let total = 0;
      let current = 0;
      let hasMultiplier = false;
      let consumedWords = 0;

      while (j < wordTokens.length && isNumWord(wordTokens[j])) {
        const tok = wordTokens[j];
        if (tok === 'y' || tok === 'de') {
          j++;
          continue;
        }
        if (tok === 'pesos') {
          hasMultiplier = true;
          j++;
          break;
        }
        if (tok === 'millon' || tok === 'millones') {
          total += (current || 1) * 1000000;
          current = 0;
          hasMultiplier = true;
          consumedWords++;
        } else if (tok === 'mil') {
          total += (current || 1) * 1000;
          current = 0;
          hasMultiplier = true;
          consumedWords++;
        } else if (SP_HUNDREDS[tok] !== undefined) {
          current += SP_HUNDREDS[tok];
          consumedWords++;
        } else if (SP_TENS[tok] !== undefined) {
          current += SP_TENS[tok];
          consumedWords++;
        } else if (SP_UNITS[tok] !== undefined) {
          current += SP_UNITS[tok];
          consumedWords++;
        }
        j++;
      }

      const candidate = total + current;
      if (candidate > 0 && (hasMultiplier || candidate >= 100) && consumedWords > 0) {
        bestAmount = candidate;
        bestStart = i;
        bestEnd = j;
        break;
      }
      i = Math.max(i + 1, j);
    }

    if (bestAmount > 0 && bestStart >= 0) {
      return {
        amount: bestAmount,
        matchedText: wordTokens.slice(bestStart, bestEnd).join(' ')
      };
    }

    return { amount: 0, matchedText: '' };
  }

  function parseSpanishMonthAndDate(rawText, fallbackMonth = null) {
    const norm = normalizeText(rawText);
    const now = new Date();
    const currentYear = now.getFullYear();
    const defaultMonth = fallbackMonth || (now.getMonth() + 1);

    // 1. ISO YYYY-MM-DD
    const isoMatch = norm.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Math.max(1, Math.min(12, Number(isoMatch[2])));
      const d = Math.max(1, Math.min(31, Number(isoMatch[3])));
      return {
        month: m,
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        matchedText: isoMatch[0],
        explicitMonth: true
      };
    }

    // 2. DD/MM(/YYYY)
    const slashMatch = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
    if (slashMatch) {
      const d = Math.max(1, Math.min(31, Number(slashMatch[1])));
      const m = Math.max(1, Math.min(12, Number(slashMatch[2])));
      const y = slashMatch[3] ? Number(slashMatch[3]) : currentYear;
      return {
        month: m,
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        matchedText: slashMatch[0],
        explicitMonth: true
      };
    }

    // 3. "hoy" / "ayer"
    if (/\bhoy\b/.test(norm)) {
      return {
        month: now.getMonth() + 1,
        date: now.toISOString().slice(0, 10),
        matchedText: 'hoy',
        explicitMonth: true
      };
    }
    if (/\bayer\b/.test(norm)) {
      const yest = new Date(now.getTime() - 86400000);
      return {
        month: yest.getMonth() + 1,
        date: yest.toISOString().slice(0, 10),
        matchedText: 'ayer',
        explicitMonth: true
      };
    }

    // 4. "(el) DD de <mes>" o "(en / del / mes de / para / de) <mes>"
    const allMonthAliases = MONTHS_ES
      .flatMap(m => m.aliases.map(a => ({ alias: a, num: m.num })))
      .sort((a, b) => b.alias.length - a.alias.length);

    const aliasPattern = allMonthAliases.map(x => x.alias).join('|');
    const dayMonthRe = new RegExp(`\\b(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${aliasPattern})\\b`);
    const dayMonthMatch = norm.match(dayMonthRe);
    if (dayMonthMatch) {
      const day = Math.max(1, Math.min(31, Number(dayMonthMatch[1])));
      const mObj = allMonthAliases.find(x => x.alias === dayMonthMatch[2]);
      if (mObj) {
        return {
          month: mObj.num,
          date: `${currentYear}-${String(mObj.num).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          matchedText: dayMonthMatch[0],
          explicitMonth: true
        };
      }
    }

    const monthPhraseRe = new RegExp(`\\b(?:(?:en\\s+el\\s+|para\\s+el\\s+|del\\s+)?mes\\s+de\\s+|(?:en|de|del|para)\\s+)?(${aliasPattern})\\b`);
    const monthMatch = norm.match(monthPhraseRe);
    if (monthMatch) {
      const mObj = allMonthAliases.find(x => x.alias === monthMatch[1]);
      if (mObj) {
        return {
          month: mObj.num,
          date: '',
          matchedText: monthMatch[0],
          explicitMonth: true
        };
      }
    }

    return {
      month: defaultMonth,
      date: '',
      matchedText: '',
      explicitMonth: false
    };
  }

  function inferDailyCategory(rawText, categoriesTemplate = null) {
    const norm = normalizeText(rawText);
    const cats = Array.isArray(categoriesTemplate)
      ? categoriesTemplate
      : createEmptyFinancialData().categories;

    // 1. Coincidencia directa con el nombre exacto de alguna de las 15 categorías
    for (const cat of cats) {
      const catNorm = normalizeText(cat.name);
      if (catNorm && norm.includes(catNorm)) {
        return { categoryId: cat.id, matchedKeyword: catNorm };
      }
    }

    // 2. Coincidencia por diccionario colombiano ponderado por longitud de frase
    let bestCat = null;
    let bestScore = 0;
    let bestKeyword = '';

    for (const rule of DAILY_CATEGORY_RULES) {
      for (const kw of rule.keywords) {
        const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(norm)) {
          const score = kw.length + (kw.includes(' ') ? 8 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestCat = rule.id;
            bestKeyword = kw;
          }
        }
      }
    }
    if (bestCat) return { categoryId: bestCat, matchedKeyword: bestKeyword };

    // 3. Coincidencia con cualquiera de las 102 variables del modelo
    for (const cat of cats) {
      for (const item of cat.items) {
        const itemNorm = normalizeText(item.name);
        if (itemNorm.length >= 4 && itemNorm !== 'otros' && norm.includes(itemNorm)) {
          return { categoryId: cat.id, matchedKeyword: itemNorm };
        }
      }
    }

    return { categoryId: 'otros_gastos', matchedKeyword: '' };
  }

  function capitalizePhrase(str) {
    const clean = String(str || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function parseDailyQuickEntry(rawText, options = {}) {
    const original = String(rawText || '').trim();
    const norm = normalizeText(original);
    const categoriesTemplate = options.categories || createEmptyFinancialData().categories;
    const fallbackMonth = options.fallbackMonth || (new Date().getMonth() + 1);
    const forceDeleteMode = !!options.forceDeleteMode;

    if (!norm) return { kind: 'empty', rawText: original };

    const deleteVerbRe = /\b(borrar|borra|eliminar|elimina|quitar|quita|limpiar|limpia|suprimir|suprime|remover|remueve|descartar|descarta|vaciar|vacia|anular|anula)\b/;
    const isDelete = forceDeleteMode || deleteVerbRe.test(norm);

    if (isDelete) {
      // Extraer mes si se menciona explícitamente
      const dateInfo = parseSpanishMonthAndDate(norm, null);
      const explicitMonth = dateInfo.explicitMonth ? dateInfo.month : null;

      // Detectar si solicita borrar el último gasto / registro
      const isLast = /\b(ultimo|ultima|reciente)\b/.test(norm) && !/\bfila\s+\d+\b/.test(norm);

      // Detectar si solicita limpiar una casilla/columna específica
      let targetField = null;
      if (/\b(valor|monto|precio|cantidad|importe|plata|pesos)\b/.test(norm)) targetField = 'amount';
      else if (/\b(nota|notas|comentario|comentarios|observacion|observaciones)\b/.test(norm)) targetField = 'note';
      else if (/\b(concepto|detalle|descripcion)\b/.test(norm)) targetField = 'concept';
      else if (/\b(fecha)\b/.test(norm)) targetField = 'date';
      else if (/\b(categoria)\b/.test(norm)) targetField = 'categoryId';

      // Detectar número de fila (#)
      let rowNumber = null;
      const rowDigitMatch = norm.match(/\b(?:fila|linea|registro|item|numero|num|#)\s*(?:numero\s+|num\s+|#\s*)?(\d+)\b/);
      if (rowDigitMatch) {
        rowNumber = parseInt(rowDigitMatch[1], 10);
      } else {
        const rowWordMatch = norm.match(/\b(?:fila|linea|registro|item|numero)\s+(?:numero\s+)?([a-z]+(?:\s+y\s+[a-z]+)?)\b/);
        if (rowWordMatch) {
          const parsed = parseSmallSpanishInt(rowWordMatch[1]);
          if (parsed && parsed > 0) rowNumber = parsed;
        } else if (forceDeleteMode && /^\d+$/.test(norm)) {
          rowNumber = parseInt(norm, 10);
        }
      }

      // Construir tokens de búsqueda del concepto limpiando verbos, mes, campo y conectores
      let conceptRemainder = norm;
      if (dateInfo.matchedText) {
        conceptRemainder = conceptRemainder.replace(dateInfo.matchedText, ' ');
      }
      conceptRemainder = conceptRemainder
        .replace(/\b(borrar|borra|eliminar|elimina|quitar|quita|limpiar|limpia|suprimir|suprime|remover|remueve|descartar|descarta|vaciar|vacia|anular|anula)\b/g, ' ')
        .replace(/\b(valor|monto|precio|cantidad|importe|plata|pesos|nota|notas|comentario|comentarios|observacion|observaciones|concepto|detalle|descripcion|fecha|categoria)\b/g, ' ')
        .replace(/\b(fila|linea|registro|gasto|gastos|entrada|movimiento|item|numero|num|ultimo|ultima|reciente)\b/g, ' ')
        .replace(/\b(el|la|los|las|de|del|en|por|para|con|al|un|una|mes|mi|mis)\b/g, ' ')
        .replace(/\b\d+\b/g, ' ')
        .replace(/[#.,;:!?()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const catGuess = conceptRemainder ? inferDailyCategory(conceptRemainder, categoriesTemplate) : { categoryId: null, matchedKeyword: '' };
      const queryTokens = conceptRemainder
        ? conceptRemainder.split(/\s+/).filter(w => w.length >= 2)
        : [];

      const mode = targetField
        ? 'clear-cell'
        : (isLast && !rowNumber && queryTokens.length === 0 && !explicitMonth ? 'last' : 'delete-row');

      return {
        kind: 'delete',
        mode,
        field: targetField,
        isLast,
        rowNumber,
        month: explicitMonth,
        categoryId: catGuess.matchedKeyword ? catGuess.categoryId : null,
        queryTokens,
        rawText: original
      };
    }

    // --- MODO AGREGAR GASTO ---
    // Extraer nota explícita si el usuario dice "... nota: <texto>" o "... nota <texto>"
    let working = original;
    let note = '';
    const noteMatch = working.match(/\bnota\s*:?\s+(.+)$/i);
    if (noteMatch) {
      note = noteMatch[1].trim();
      working = working.slice(0, noteMatch.index).trim();
    }

    const amountInfo = parseColombianAmount(working);
    const dateInfo = parseSpanishMonthAndDate(working, fallbackMonth);
    const catInfo = inferDailyCategory(working, categoriesTemplate);

    // Extraer concepto limpio eliminando el monto y el mes/fecha detectados
    let conceptNorm = normalizeText(working);
    if (amountInfo.matchedText) {
      conceptNorm = conceptNorm.replace(amountInfo.matchedText, ' ');
    }
    if (dateInfo.matchedText) {
      conceptNorm = conceptNorm.replace(dateInfo.matchedText, ' ');
    }
    conceptNorm = conceptNorm
      .replace(/\$+/g, ' ')
      .replace(/\b(pesos|cop|gasto|gaste|pague|pago|compre|compra|agregar|anotar|registrar|registrarme|en el mes de|mes de|en el|del mes|de la|de los|de las)\b/g, ' ')
      .replace(/^\s*(en|de|del|el|la|los|las|para|por|un|una|con)\b\s*/g, '')
      .replace(/\s*\b(en|de|del|para|por|el|la)\s*$/g, '')
      .replace(/[,;:\-–]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let concept = capitalizePhrase(conceptNorm);
    if (!concept) {
      if (catInfo.matchedKeyword) {
        concept = capitalizePhrase(catInfo.matchedKeyword);
      } else {
        const catObj = categoriesTemplate.find(c => c.id === catInfo.categoryId);
        concept = catObj ? capitalizePhrase(catObj.name.toLowerCase()) : 'Gasto diario';
      }
    }

    return {
      kind: 'add',
      month: dateInfo.month,
      date: dateInfo.date,
      categoryId: catInfo.categoryId,
      concept,
      amount: Math.max(0, Number(amountInfo.amount) || 0),
      note,
      rawText: original
    };
  }

  function computeDailyMatrix(entries, categoriesTemplate = null) {
    const cats = Array.isArray(categoriesTemplate)
      ? categoriesTemplate
      : createEmptyFinancialData().categories;
    const list = Array.isArray(entries) ? entries : [];

    const byCat = {};
    cats.forEach(cat => {
      byCat[cat.id] = {
        categoryId: cat.id,
        categoryName: cat.name,
        pillar: cat.pillar,
        color: cat.color,
        months: new Array(12).fill(0),
        total: 0,
        activeMonths: 0,
        realMonthlyAvg: 0,
        annualAvg12: 0,
        entryCount: 0,
        entries: []
      };
    });

    list.forEach(entry => {
      const catId = byCat[entry.categoryId] ? entry.categoryId : 'otros_gastos';
      const monthIdx = Math.max(0, Math.min(11, (Number(entry.month) || 1) - 1));
      const amt = Math.max(0, Number(entry.amount) || 0);
      byCat[catId].months[monthIdx] += amt;
      byCat[catId].entryCount += 1;
      byCat[catId].entries.push(entry);
    });

    const grandMonths = new Array(12).fill(0);
    let grandTotal = 0;
    let sumOfCategoryRealAvgs = 0;

    const rows = cats.map(cat => {
      const row = byCat[cat.id];
      let total = 0;
      let activeMonths = 0;
      for (let m = 0; m < 12; m++) {
        const v = row.months[m];
        total += v;
        grandMonths[m] += v;
        if (v > 0) activeMonths++;
      }
      row.total = total;
      row.activeMonths = activeMonths;
      row.realMonthlyAvg = activeMonths > 0 ? total / activeMonths : 0;
      row.annualAvg12 = total / 12;
      grandTotal += total;
      sumOfCategoryRealAvgs += row.realMonthlyAvg;
      return row;
    });

    let grandActiveMonths = 0;
    for (let m = 0; m < 12; m++) {
      if (grandMonths[m] > 0) grandActiveMonths++;
    }
    const grandRealMonthlyAvg = grandActiveMonths > 0 ? grandTotal / grandActiveMonths : 0;
    const grandAnnualAvg12 = grandTotal / 12;

    return {
      rows,
      byCat,
      grandMonths,
      grandTotal,
      grandActiveMonths,
      grandRealMonthlyAvg,
      grandAnnualAvg12,
      sumOfCategoryRealAvgs,
      totalEntries: list.length
    };
  }

  function suggestModelVariableForCategory(cat, catEntries) {
    if (!cat || !Array.isArray(cat.items) || cat.items.length === 0) return null;
    const entries = Array.isArray(catEntries) ? catEntries : [];
    const corpus = normalizeText(entries.map(e => `${e.concept || ''} ${e.note || ''}`).join(' '));

    // 1. Buscar coincidencia por palabras del concepto contra los nombres/notas de las variables de la categoría
    let bestItem = null;
    let bestScore = 0;

    cat.items.forEach(item => {
      const itemText = normalizeText(`${item.name || ''} ${item.note || ''}`);
      const tokens = itemText.split(/\s+/).filter(w => w.length >= 4 && w !== 'otros' && w !== 'otra');
      let score = 0;
      tokens.forEach(tok => {
        // Coincidencia de raíz simple (ej. "mercado" <-> "mercados", "restaurante" <-> "restaurantes")
        const stem = tok.length > 5 ? tok.slice(0, -1) : tok;
        if (corpus.includes(tok)) score += tok.length + 4;
        else if (stem.length >= 4 && corpus.includes(stem)) score += stem.length + 2;
      });
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    });

    if (bestItem) return bestItem.id;

    // 2. Preferir la primera variable activa (> $0) existente o "Otros" o la primera de la categoría
    const firstActive = cat.items.find(it => (Number(it.amount) || 0) > 0);
    if (firstActive) return firstActive.id;

    const otros = cat.items.find(it => normalizeText(it.name).includes('otros'));
    return otros ? otros.id : cat.items[0].id;
  }

  window.MPFData = {
    STORAGE_KEY,
    SESSION_KEY,
    DEFAULT_TARGETS,
    PILLAR_INFO,
    PATRIMONIO_CATEGORIES,
    MONTHS_ES,
    normalizeCedula,
    formatCedulaDisplay,
    formatCOP,
    formatCOPShort,
    formatPct,
    escapeAttr,
    getInitials,
    pickProfileColor,
    normalizeText,
    getMonthMeta,
    createEmptyFinancialData,
    createDanielFinancialData,
    createDanielaFinancialData,
    createEmptyPatrimonioData,
    createDanielPatrimonioData,
    createDefaultState,
    computeMetrics,
    getPillarGapText,
    computePatrimonioMetrics,
    computeGroupConsolidated,
    futureValueMonthly,
    parseColombianAmount,
    parseSpanishMonthAndDate,
    inferDailyCategory,
    parseDailyQuickEntry,
    computeDailyMatrix,
    suggestModelVariableForCategory
  };
})();
