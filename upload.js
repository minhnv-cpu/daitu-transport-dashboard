/* ============================================================
   UPLOAD.JS — Excel Upload & Data Archive Module
   Client-side Excel parsing + IndexedDB storage
   ============================================================ */

const UploadManager = (function () {
  'use strict';

  // ─── IndexedDB Configuration ──────────────────────────
  const DB_NAME = 'DaiTuDashboard';
  const DB_VERSION = 1;
  const STORE_ARCHIVE = 'archives';
  const STORE_ACTIVE = 'active_data';

  let db = null;

  // ─── Column Mapping from Excel → JSON ─────────────────
  const ONTIME_COL_MAP = {
    'load_date: day': 'date',
    'load_date: Day': 'date',
    'lane_type_2': 'lane',
    'partner_code': 'partner',
    'partner_type': 'ptype',
    'code': 'code',
    'scheduler_name': 'route',
    'number_plate': 'plate',
    'số điểm lỗi do tải': 'faults',
    'Số điểm lỗi do tải': 'faults',
    'số điểm dừng': 'stops',
    'Số điểm dừng': 'stops',
    '%ontime vận tải': 'ontime',
    '%Ontime Vận tải': 'ontime',
    '%ontime vận tải': 'ontime'
  };

  const FILLRATE_COL_MAP = {
    'load_date: day': 'date',
    'load_date: Day': 'date',
    'mã chuyến': 'code',
    'Mã chuyến': 'code',
    'mã tuyến': 'route',
    'Mã tuyến': 'route',
    'loại tuyến': 'lane',
    'Loại tuyến': 'lane',
    'tên ncc': 'ncc',
    'Tên NCC': 'ncc',
    'biển kiểm soát': 'plate',
    'Biển kiểm soát': 'plate',
    'tải trọng': 'cap',
    'Tải trọng': 'cap',
    'tổng quãng đường (km)': 'km',
    'Tổng quãng đường (km)': 'km',
    'tỷ lệ lấp đầy chuyến (kg)': 'fr_kg',
    'Tỷ lệ lấp đầy chuyến (kg)': 'fr_kg',
    'tỷ lệ lấp đầy chuyến (đơn)': 'fr_don',
    'Tỷ lệ lấp đầy chuyến (đơn)': 'fr_don'
  };

  // Province patterns (same as app.js)
  const PROVINCE_PATTERNS = {
    'Hải Phòng': [/haiphong/i, /hai\s*phong/i, /hp/i, /hph/i],
    'Thái Nguyên': [/thainguyen/i, /thai\s*nguyen/i, /tn/i, /tng/i],
    'Bắc Giang': [/bacgiang/i, /bac\s*giang/i, /bg/i, /bgi/i],
    'Phú Thọ': [/phutho/i, /phu\s*tho/i, /pt/i, /pth/i],
    'Tuyên Quang': [/tuyenquang/i, /tuyen\s*quang/i, /tq/i, /tqu/i],
    'Sơn La': [/sonla/i, /son\s*la/i, /sl/i, /sla/i],
    'Lào Cai': [/laocai/i, /lao\s*cai/i, /lc/i, /lca/i],
    'Vĩnh Phúc': [/vinhphuc/i, /vinh\s*phuc/i, /vp/i, /vph/i],
    'Quảng Ninh': [/quangninh/i, /quang\s*ninh/i, /qn/i, /qni/i],
    'Hoà Bình': [/hoabinh/i, /hoa\s*binh/i, /hb/i, /hbi/i],
    'Lạng Sơn': [/langson/i, /lang\s*son/i, /ls/i, /lso/i],
    'Yên Bái': [/yenbai/i, /yen\s*bai/i, /yb/i, /yba/i]
  };

  function getProvinceFromRoute(route) {
    if (!route) return null;
    const cleaned = route.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
    for (const [province, patterns] of Object.entries(PROVINCE_PATTERNS)) {
      for (const pat of patterns) {
        if (pat.test(cleaned)) return province;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════
  //  IndexedDB Operations
  // ═══════════════════════════════════════════════════════

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_ARCHIVE)) {
          d.createObjectStore(STORE_ARCHIVE, { keyPath: 'period' });
        }
        if (!d.objectStoreNames.contains(STORE_ACTIVE)) {
          d.createObjectStore(STORE_ACTIVE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveArchive(period, data) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ARCHIVE, 'readwrite');
      tx.objectStore(STORE_ARCHIVE).put({
        period,
        data,
        savedAt: new Date().toISOString(),
        recordCount: {
          ontime: data.ontimeDetail ? data.ontimeDetail.length : 0,
          fillrate: data.fillDetail ? data.fillDetail.length : 0
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadArchive(period) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ARCHIVE, 'readonly');
      const req = tx.objectStore(STORE_ARCHIVE).get(period);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function listArchives() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ARCHIVE, 'readonly');
      const req = tx.objectStore(STORE_ARCHIVE).getAll();
      req.onsuccess = () => {
        const list = (req.result || []).map(item => ({
          period: item.period,
          savedAt: item.savedAt,
          recordCount: item.recordCount
        }));
        list.sort((a, b) => b.period.localeCompare(a.period));
        resolve(list);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteArchive(period) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ARCHIVE, 'readwrite');
      tx.objectStore(STORE_ARCHIVE).delete(period);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // Save active uploaded data reference
  async function setActiveUpload(period) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ACTIVE, 'readwrite');
      tx.objectStore(STORE_ACTIVE).put({ id: 'current', period, setAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getActiveUpload() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ACTIVE, 'readonly');
      const req = tx.objectStore(STORE_ACTIVE).get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearActiveUpload() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE_ACTIVE, 'readwrite');
      tx.objectStore(STORE_ACTIVE).delete('current');
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ═══════════════════════════════════════════════════════
  //  Excel Parsing
  // ═══════════════════════════════════════════════════════

  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          resolve(workbook);
        } catch (err) {
          reject(new Error('Không thể đọc file Excel: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Lỗi đọc file'));
      reader.readAsArrayBuffer(file);
    });
  }

  function sheetToRows(workbook, sheetIndex = 0) {
    const sheetName = workbook.SheetNames[sheetIndex || 0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  function findColumnMapping(headers, colMap) {
    const mapping = {};
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const [excelCol, jsonField] of Object.entries(colMap)) {
        if (headerLower === excelCol.toLowerCase().trim()) {
          mapping[header] = jsonField;
          break;
        }
      }
    }
    return mapping;
  }

  function formatDateShort(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const d = String(val.getDate()).padStart(2, '0');
      const m = String(val.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}`;
    }
    if (typeof val === 'string') {
      // Try to parse various formats
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        const parts = val.split('-');
        return `${parts[2].substring(0,2)}/${parts[1]}`;
      }
      if (/^\d{2}\/\d{2}/.test(val)) return val.substring(0, 5);
    }
    if (typeof val === 'number') {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}`;
    }
    return String(val);
  }

  function formatDateISO(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof val === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
      if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
        const p = val.split('/');
        return `${p[2]}-${p[1]}-${p[0]}`;
      }
    }
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    return '';
  }

  function parseOntimeExcel(workbook) {
    const rows = sheetToRows(workbook, 0);
    if (rows.length === 0) throw new Error('File Ontime không có dữ liệu');

    const headers = Object.keys(rows[0]);
    const mapping = findColumnMapping(headers, ONTIME_COL_MAP);

    const mapped = rows.map(row => {
      const dateVal = row[headers.find(h => mapping[h] === 'date')] || '';
      return {
        code: String(row[headers.find(h => mapping[h] === 'code')] || ''),
        date: formatDateShort(dateVal),
        dateISO: formatDateISO(dateVal),
        lane: String(row[headers.find(h => mapping[h] === 'lane')] || ''),
        partner: String(row[headers.find(h => mapping[h] === 'partner')] || ''),
        ptype: String(row[headers.find(h => mapping[h] === 'ptype')] || ''),
        route: String(row[headers.find(h => mapping[h] === 'route')] || ''),
        plate: String(row[headers.find(h => mapping[h] === 'plate')] || ''),
        faults: Number(row[headers.find(h => mapping[h] === 'faults')] || 0),
        stops: Number(row[headers.find(h => mapping[h] === 'stops')] || 0),
        ontime: Number(row[headers.find(h => mapping[h] === 'ontime')] || 0)
      };
    }).filter(r => r.code && r.date);

    return mapped;
  }

  function parseFillrateExcel(workbook) {
    const rows = sheetToRows(workbook, 0);
    if (rows.length === 0) throw new Error('File Lấp đầy không có dữ liệu');

    const headers = Object.keys(rows[0]);
    const mapping = findColumnMapping(headers, FILLRATE_COL_MAP);

    const mapped = rows.map(row => {
      const dateVal = row[headers.find(h => mapping[h] === 'date')] || '';
      return {
        code: String(row[headers.find(h => mapping[h] === 'code')] || ''),
        date: formatDateShort(dateVal),
        dateISO: formatDateISO(dateVal),
        route: String(row[headers.find(h => mapping[h] === 'route')] || ''),
        lane: String(row[headers.find(h => mapping[h] === 'lane')] || ''),
        ncc: String(row[headers.find(h => mapping[h] === 'ncc')] || ''),
        plate: String(row[headers.find(h => mapping[h] === 'plate')] || ''),
        cap: Number(row[headers.find(h => mapping[h] === 'cap')] || 0),
        km: Number(row[headers.find(h => mapping[h] === 'km')] || 0),
        fr_kg: Number(row[headers.find(h => mapping[h] === 'fr_kg')] || 0),
        fr_don: Number(row[headers.find(h => mapping[h] === 'fr_don')] || 0)
      };
    }).filter(r => r.code && r.date);

    return mapped;
  }

  // ═══════════════════════════════════════════════════════
  //  Summary Builder — from detail data → dashboard JSON
  // ═══════════════════════════════════════════════════════

  function buildSummaryData(ontimeDetail, fillDetail) {
    const now = new Date().toISOString().replace('T', 'T').substring(0, 19);

    // Determine date range
    const allDatesISO = [
      ...ontimeDetail.map(r => r.dateISO),
      ...fillDetail.map(r => r.dateISO)
    ].filter(Boolean).sort();
    const minDate = allDatesISO[0] || '';
    const maxDate = allDatesISO[allDatesISO.length - 1] || '';
    const minDateShort = minDate ? `${minDate.split('-')[2]}/${minDate.split('-')[1]}` : '';
    const maxDateShort = maxDate ? `${maxDate.split('-')[2]}/${maxDate.split('-')[1]}/${minDate.split('-')[0]}` : '';

    // ── Build ontime.json ──────────────────────────────
    // daily
    const ontimeByDate = {};
    ontimeDetail.forEach(r => {
      if (!r.dateISO) return;
      if (!ontimeByDate[r.dateISO]) ontimeByDate[r.dateISO] = { trips: 0, ontimeSum: 0 };
      ontimeByDate[r.dateISO].trips++;
      ontimeByDate[r.dateISO].ontimeSum += r.ontime;
    });
    const ontimeDaily = Object.keys(ontimeByDate).sort().map(d => ({
      date: d,
      ontime_rate: ontimeByDate[d].ontimeSum / ontimeByDate[d].trips,
      trips: ontimeByDate[d].trips
    }));

    // overall
    const totalOntimeTrips = ontimeDetail.length;
    const totalOntimeSum = ontimeDetail.reduce((s, r) => s + r.ontime, 0);
    const overallOntimeRate = totalOntimeTrips > 0 ? totalOntimeSum / totalOntimeTrips : 0;

    // by_lane_type
    const ontimeLanes = {};
    ontimeDetail.forEach(r => {
      if (!ontimeLanes[r.lane]) ontimeLanes[r.lane] = { trips: 0, sum: 0 };
      ontimeLanes[r.lane].trips++;
      ontimeLanes[r.lane].sum += r.ontime;
    });
    const by_lane_type = Object.keys(ontimeLanes).map(l => ({
      lane_type: l,
      ontime_rate: ontimeLanes[l].sum / ontimeLanes[l].trips,
      trips: ontimeLanes[l].trips
    }));

    // by_partner_type
    const ontimePTypes = {};
    ontimeDetail.forEach(r => {
      if (!ontimePTypes[r.ptype]) ontimePTypes[r.ptype] = { trips: 0, sum: 0 };
      ontimePTypes[r.ptype].trips++;
      ontimePTypes[r.ptype].sum += r.ontime;
    });
    const by_partner_type = Object.keys(ontimePTypes).map(p => ({
      partner_type: p,
      ontime_rate: ontimePTypes[p].sum / ontimePTypes[p].trips,
      trips: ontimePTypes[p].trips
    }));

    // by_partner
    const ontimePartners = {};
    ontimeDetail.forEach(r => {
      if (!ontimePartners[r.partner]) ontimePartners[r.partner] = { trips: 0, sum: 0 };
      ontimePartners[r.partner].trips++;
      ontimePartners[r.partner].sum += r.ontime;
    });
    const by_partner = Object.keys(ontimePartners).map(p => ({
      partner: p,
      ontime_rate: ontimePartners[p].sum / ontimePartners[p].trips,
      trips: ontimePartners[p].trips
    }));

    // by_province
    const ontimeProvinces = {};
    ontimeDetail.forEach(r => {
      const prov = getProvinceFromRoute(r.route);
      if (prov) {
        if (!ontimeProvinces[prov]) ontimeProvinces[prov] = { trips: 0, sum: 0 };
        ontimeProvinces[prov].trips++;
        ontimeProvinces[prov].sum += r.ontime;
      }
    });
    const by_province = Object.keys(ontimeProvinces).map(p => ({
      province: p,
      ontime_rate: ontimeProvinces[p].sum / ontimeProvinces[p].trips,
      trips: ontimeProvinces[p].trips
    }));

    // worst routes
    const ontimeRoutes = {};
    ontimeDetail.forEach(r => {
      if (!r.route) return;
      if (!ontimeRoutes[r.route]) ontimeRoutes[r.route] = { trips: 0, sum: 0, lane: r.lane, partner: r.partner };
      ontimeRoutes[r.route].trips++;
      ontimeRoutes[r.route].sum += r.ontime;
    });
    const top10_worst_ontime = Object.keys(ontimeRoutes).map(rt => ({
      route: rt,
      lane_type: ontimeRoutes[rt].lane,
      partner: ontimeRoutes[rt].partner,
      trips: ontimeRoutes[rt].trips,
      ontime_rate: ontimeRoutes[rt].sum / ontimeRoutes[rt].trips
    })).sort((a, b) => a.ontime_rate - b.ontime_rate).slice(0, 10);

    const ontimeSummary = {
      metadata: {
        date_range: `${minDateShort} - ${maxDateShort}`,
        total_trips: totalOntimeTrips,
        generated_at: now
      },
      overall: { ontime_rate: overallOntimeRate, total_trips: totalOntimeTrips },
      daily: ontimeDaily,
      by_lane_type,
      by_partner_type,
      by_partner,
      by_province,
      top10_worst_routes: top10_worst_ontime
    };

    // ── Build fillrate.json ────────────────────────────
    const fillByDate = {};
    fillDetail.forEach(r => {
      if (!r.dateISO) return;
      if (!fillByDate[r.dateISO]) fillByDate[r.dateISO] = { trips: 0, kgSum: 0, donSum: 0, kgCount: 0, donCount: 0 };
      fillByDate[r.dateISO].trips++;
      if (r.fr_kg != null) { fillByDate[r.dateISO].kgSum += r.fr_kg; fillByDate[r.dateISO].kgCount++; }
      if (r.fr_don != null) { fillByDate[r.dateISO].donSum += r.fr_don; fillByDate[r.dateISO].donCount++; }
    });
    const fillDaily = Object.keys(fillByDate).sort().map(d => ({
      date: d,
      fillrate_kg: fillByDate[d].kgCount > 0 ? fillByDate[d].kgSum / fillByDate[d].kgCount : 0,
      fillrate_don: fillByDate[d].donCount > 0 ? fillByDate[d].donSum / fillByDate[d].donCount : 0,
      trips: fillByDate[d].trips
    }));

    const totalFillTrips = fillDetail.length;
    const fillKgSum = fillDetail.reduce((s, r) => s + (r.fr_kg || 0), 0);
    const fillDonSum = fillDetail.reduce((s, r) => s + (r.fr_don || 0), 0);
    const overallFillKg = totalFillTrips > 0 ? fillKgSum / totalFillTrips : 0;
    const overallFillDon = totalFillTrips > 0 ? fillDonSum / totalFillTrips : 0;

    // by_lane_type
    const fillLanes = {};
    fillDetail.forEach(r => {
      if (!fillLanes[r.lane]) fillLanes[r.lane] = { trips: 0, kgSum: 0, donSum: 0, kgC: 0, donC: 0 };
      fillLanes[r.lane].trips++;
      if (r.fr_kg != null) { fillLanes[r.lane].kgSum += r.fr_kg; fillLanes[r.lane].kgC++; }
      if (r.fr_don != null) { fillLanes[r.lane].donSum += r.fr_don; fillLanes[r.lane].donC++; }
    });
    const fill_by_lane = Object.keys(fillLanes).map(l => ({
      lane_type: l,
      fillrate_kg: fillLanes[l].kgC > 0 ? fillLanes[l].kgSum / fillLanes[l].kgC : 0,
      fillrate_don: fillLanes[l].donC > 0 ? fillLanes[l].donSum / fillLanes[l].donC : 0,
      trips: fillLanes[l].trips
    }));

    // by_ncc
    const fillNccs = {};
    fillDetail.forEach(r => {
      if (!fillNccs[r.ncc]) fillNccs[r.ncc] = { trips: 0, kgSum: 0, donSum: 0, kgC: 0, donC: 0 };
      fillNccs[r.ncc].trips++;
      if (r.fr_kg != null) { fillNccs[r.ncc].kgSum += r.fr_kg; fillNccs[r.ncc].kgC++; }
      if (r.fr_don != null) { fillNccs[r.ncc].donSum += r.fr_don; fillNccs[r.ncc].donC++; }
    });
    const fill_by_ncc = Object.keys(fillNccs).map(n => ({
      ncc: n,
      fillrate_kg: fillNccs[n].kgC > 0 ? fillNccs[n].kgSum / fillNccs[n].kgC : 0,
      fillrate_don: fillNccs[n].donC > 0 ? fillNccs[n].donSum / fillNccs[n].donC : 0,
      trips: fillNccs[n].trips
    }));

    // worst routes
    const fillRoutes = {};
    fillDetail.forEach(r => {
      if (!r.route) return;
      if (!fillRoutes[r.route]) fillRoutes[r.route] = { trips: 0, kgSum: 0, donSum: 0, kgC: 0, donC: 0, lane: r.lane, ncc: r.ncc };
      fillRoutes[r.route].trips++;
      if (r.fr_kg != null) { fillRoutes[r.route].kgSum += r.fr_kg; fillRoutes[r.route].kgC++; }
      if (r.fr_don != null) { fillRoutes[r.route].donSum += r.fr_don; fillRoutes[r.route].donC++; }
    });
    const top10_worst_fill = Object.keys(fillRoutes).map(rt => ({
      route: rt,
      lane_type: fillRoutes[rt].lane,
      ncc: fillRoutes[rt].ncc,
      trips: fillRoutes[rt].trips,
      fillrate_kg: fillRoutes[rt].kgC > 0 ? fillRoutes[rt].kgSum / fillRoutes[rt].kgC : 0,
      fillrate_don: fillRoutes[rt].donC > 0 ? fillRoutes[rt].donSum / fillRoutes[rt].donC : 0
    })).sort((a, b) => a.fillrate_kg - b.fillrate_kg).slice(0, 10);

    const fillSummary = {
      metadata: {
        date_range: `${minDateShort} - ${maxDateShort}`,
        total_trips: totalFillTrips,
        generated_at: now
      },
      overall: { fillrate_kg: overallFillKg, fillrate_don: overallFillDon, total_trips: totalFillTrips },
      daily: fillDaily,
      by_lane_type: fill_by_lane,
      by_ncc: fill_by_ncc,
      top10_worst_routes: top10_worst_fill
    };

    // ── Build vehicles.json ────────────────────────────
    const vehicleMap = {};
    const vehicleDatesSet = new Set();
    fillDetail.forEach(r => {
      if (!r.plate) return;
      vehicleDatesSet.add(r.dateISO);
      if (!vehicleMap[r.plate]) vehicleMap[r.plate] = { trips: 0, totalKm: 0, cap: r.cap, datesActive: new Set() };
      vehicleMap[r.plate].trips++;
      vehicleMap[r.plate].totalKm += r.km || 0;
      if (r.dateISO) vehicleMap[r.plate].datesActive.add(r.dateISO);
    });

    const totalVehicles = Object.keys(vehicleMap).length;
    const totalDays = vehicleDatesSet.size || 1;
    const totalTripsAll = Object.values(vehicleMap).reduce((s, v) => s + v.trips, 0);
    const totalKmAll = Object.values(vehicleMap).reduce((s, v) => s + v.totalKm, 0);

    // daily_usage
    const dailyVehicleUsage = {};
    fillDetail.forEach(r => {
      if (!r.dateISO || !r.plate) return;
      if (!dailyVehicleUsage[r.dateISO]) dailyVehicleUsage[r.dateISO] = { vehicles: new Set(), trips: 0, totalKm: 0 };
      dailyVehicleUsage[r.dateISO].vehicles.add(r.plate);
      dailyVehicleUsage[r.dateISO].trips++;
      dailyVehicleUsage[r.dateISO].totalKm += r.km || 0;
    });
    const daily_usage = Object.keys(dailyVehicleUsage).sort().map(d => {
      const du = dailyVehicleUsage[d];
      const vc = du.vehicles.size;
      return {
        date: d,
        vehicle_count: vc,
        total_trips: du.trips,
        avg_trips_per_vehicle: vc > 0 ? du.trips / vc : 0,
        avg_km: vc > 0 ? du.totalKm / vc : 0
      };
    });

    // by_load_capacity
    const capMap = {};
    Object.values(vehicleMap).forEach(v => {
      const capName = v.cap ? v.cap + ' kg' : 'Khác';
      if (!capMap[capName]) capMap[capName] = { count: 0, cap_raw: v.cap };
      capMap[capName].count++;
    });
    const by_load_capacity = Object.keys(capMap).map(c => ({
      capacity: c,
      capacity_raw: capMap[c].cap_raw,
      count: capMap[c].count,
      percentage: totalVehicles > 0 ? capMap[c].count / totalVehicles : 0
    }));

    // top15
    const vehicleList = Object.keys(vehicleMap).map(plate => {
      const v = vehicleMap[plate];
      const daysActive = v.datesActive.size || 1;
      return {
        plate,
        trips: v.trips,
        days_active: daysActive,
        trips_per_day: v.trips / daysActive,
        km_per_day: v.totalKm / daysActive,
        total_km: v.totalKm
      };
    });
    const top15_most_used = [...vehicleList].sort((a, b) => b.trips - a.trips).slice(0, 15);
    const top15_least_used = [...vehicleList].sort((a, b) => a.trips - b.trips).slice(0, 15);

    // anomalies
    const anomaly_vehicles = vehicleList.filter(v => {
      return v.trips_per_day > 6 || v.km_per_day > 1500 || v.trips <= 1;
    }).map(v => ({
      plate: v.plate,
      reason: v.trips_per_day > 6 ? 'Chạy quá nhiều chuyến' : (v.km_per_day > 1500 ? 'Km/ngày quá cao' : 'Ít hoạt động'),
      trips: v.trips,
      days_active: v.days_active,
      trips_per_day: v.trips_per_day,
      km_per_day: v.km_per_day
    }));

    const vehicleSummary = {
      metadata: { generated_at: now },
      summary: {
        total_vehicles: totalVehicles,
        avg_trips_per_day: totalVehicles > 0 ? totalTripsAll / totalVehicles / totalDays : 0,
        avg_km_per_day: totalVehicles > 0 ? totalKmAll / totalVehicles / totalDays : 0,
        anomaly_count: anomaly_vehicles.length
      },
      daily_usage,
      by_load_capacity,
      top15_most_used,
      top15_least_used,
      anomaly_vehicles
    };

    return {
      ontime: ontimeSummary,
      fillrate: fillSummary,
      vehicles: vehicleSummary,
      ontimeDetail,
      fillDetail,
      dateRange: { min: minDate, max: maxDate }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Merge Logic
  // ═══════════════════════════════════════════════════════

  function mergeDetailData(existing, newData) {
    const codeSet = new Set(existing.map(r => r.code));
    const merged = [...existing];
    let addedCount = 0;
    for (const row of newData) {
      if (!codeSet.has(row.code)) {
        merged.push(row);
        codeSet.add(row.code);
        addedCount++;
      }
    }
    return { merged, addedCount };
  }

  // ═══════════════════════════════════════════════════════
  //  Detect File Type
  // ═══════════════════════════════════════════════════════

  function detectFileType(workbook) {
    const rows = sheetToRows(workbook, 0);
    if (rows.length === 0) return 'unknown';
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());

    if (headers.some(h => h.includes('%ontime') || h.includes('ontime vận tải'))) return 'ontime';
    if (headers.some(h => h.includes('lấp đầy') || h.includes('tỷ lệ lấp đầy'))) return 'fillrate';
    if (headers.some(h => h === 'number_plate' || h === 'scheduler_name')) return 'ontime';
    if (headers.some(h => h.includes('mã chuyến') || h.includes('tên ncc'))) return 'fillrate';

    return 'unknown';
  }

  // ═══════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════

  return {
    openDB,
    saveArchive,
    loadArchive,
    listArchives,
    deleteArchive,
    setActiveUpload,
    getActiveUpload,
    clearActiveUpload,
    readExcelFile,
    parseOntimeExcel,
    parseFillrateExcel,
    detectFileType,
    buildSummaryData,
    mergeDetailData
  };

})();
