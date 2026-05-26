/* ============================================================
   DAI TU TRANSPORTATION DASHBOARD — Application Logic
   ============================================================ */

(function () {
  'use strict';

  // ─── Chart Color Palette ─────────────────────────────────
  const CHART_COLORS = [
    '#f26522', '#005691', '#f87171', '#fbbf24', '#3498db',
    '#a78bfa', '#fb7185', '#22d3ee', '#facc15', '#818cf8',
    '#f97316', '#34d399'
  ];

  // ─── Threshold Constants ─────────────────────────────────
  const ONTIME_DANGER = 0.90;
  const ONTIME_WARNING = 0.95;
  const FILLRATE_DANGER = 0.50;
  const FILLRATE_WARNING = 0.70;

  // ─── Global Chart Instances ──────────────────────────────
  const charts = {};

  // ─── Global Date Filter State ───────────────────────────
  let rawData = null; // Stored raw MTD data from JSONs ({ ontime, fillrate, vehicles })
  let filterMode = 'all'; // 'all' | 'single' | 'range'
  let selectedDate = null; // "YYYY-MM-DD" for single day
  let startDateVal = '2026-05-01'; // "YYYY-MM-DD" for start range
  let endDateVal = '2026-05-25'; // "YYYY-MM-DD" for end range
  const MIN_DATE = '2026-05-01';
  const MAX_DATE = '2026-05-25';

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
    for (const prov in PROVINCE_PATTERNS) {
      for (const pat of PROVINCE_PATTERNS[prov]) {
        if (pat.test(cleaned)) {
          return prov;
        }
      }
    }
    return null;
  }

  // ─── Detail Table State ─────────────────────────────
  const ROWS_PER_PAGE = 20;
  let ontimeDetailData = [];
  let ontimeFilteredData = [];
  let ontimeCurrentPage = 1;
  let fillDetailData = [];
  let fillFilteredData = [];
  let fillCurrentPage = 1;

  // ─── DOM References ──────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Utility Functions ───────────────────────────────────

  /** Format a ratio (0-1) as percentage string */
  function fmtPct(val, decimals = 1) {
    if (val == null || isNaN(val)) return '—';
    return (val * 100).toFixed(decimals) + '%';
  }

  /** Format large number with commas */
  function fmtNum(val) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toLocaleString('vi-VN');
  }

  /** Format number with decimals */
  function fmtDec(val, d = 2) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toFixed(d);
  }

  /** Get short date label from ISO date string */
  function shortDate(isoStr) {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    return parts[2] + '/' + parts[1]; // DD/MM
  }

  /** Get threshold CSS class for ontime rate */
  function ontimeClass(rate) {
    if (rate < ONTIME_DANGER) return 'danger';
    if (rate < ONTIME_WARNING) return 'warning';
    return 'good';
  }

  /** Get threshold hex color for ontime rate */
  function ontimeColor(rate) {
    if (rate < ONTIME_DANGER) return '#f87171';
    if (rate < ONTIME_WARNING) return '#fbbf24';
    return '#2ecc71';
  }

  /** Get threshold CSS class for fill rate */
  function fillrateClass(rate) {
    if (rate < FILLRATE_DANGER) return 'danger';
    if (rate < FILLRATE_WARNING) return 'warning';
    return 'good';
  }

  function fillrateColor(rate) {
    if (rate < FILLRATE_DANGER) return '#f87171';
    if (rate < FILLRATE_WARNING) return '#fbbf24';
    return '#2ecc71';
  }

  /** Animate a number counting up */
  function animateCount(el, target, suffix = '', decimals = 0, duration = 1200) {
    const start = 0;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      el.textContent = decimals > 0 ? current.toFixed(decimals) + suffix : Math.round(current).toLocaleString('vi-VN') + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Chart.js Global Defaults ────────────────────────────
  function setupChartDefaults() {
    // Register the DataLabels plugin
    Chart.register(ChartDataLabels);

    // Disable DataLabels globally by default
    Chart.defaults.plugins.datalabels = {
      display: false
    };

    Chart.defaults.color = '#556677';
    Chart.defaults.borderColor = 'rgba(0,0,0,0.06)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 7;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(30,39,46,0.95)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,0,0,0.08)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 9;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  // ─── Data Loading ────────────────────────────────────────

  async function loadJSON(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${path}`);
    return resp.json();
  }

  async function loadAllData() {
    // Try fetch first
    try {
      const [ontime, fillrate, vehicles] = await Promise.all([
        loadJSON('data/ontime.json'),
        loadJSON('data/fillrate.json'),
        loadJSON('data/vehicles.json')
      ]);
      return { ontime, fillrate, vehicles };
    } catch (fetchErr) {
      console.warn('Fetch failed, trying global variables fallback:', fetchErr.message);
      // Fallback: check global variables (set by <script> tags)
      if (window.__ontime_data && window.__fillrate_data && window.__vehicles_data) {
        return {
          ontime: window.__ontime_data,
          fillrate: window.__fillrate_data,
          vehicles: window.__vehicles_data
        };
      }
      throw new Error('Không thể tải dữ liệu. Hãy đảm bảo các file JSON tồn tại trong thư mục data/.');
    }
  }

  // ─── Tab Switching ───────────────────────────────────────

  function initTabs() {
    const btns = $$('.tab-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Deactivate all
        btns.forEach((b) => b.classList.remove('active'));
        $$('.tab-panel').forEach((p) => p.classList.remove('active'));
        // Activate clicked
        btn.classList.add('active');
        const panelId = 'panel' + capitalize(btn.dataset.tab);
        const panel = $('#' + panelId);
        if (panel) {
          panel.classList.add('active');
          // Re-trigger animation
          panel.style.animation = 'none';
          // Force reflow
          void panel.offsetHeight;
          panel.style.animation = '';
        }
      });
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatTimestamp(tsStr) {
    if (!tsStr) return 'Không rõ';
    try {
      // Input: "2026-05-26T15:32:40"
      const parts = tsStr.split('T');
      const dateParts = parts[0].split('-');
      const timeStr = parts[1] || '00:00:00';
      return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} ${timeStr}`;
    } catch (e) {
      return tsStr;
    }
  }

  // ─── Render KPI Cards ───────────────────────────────────

  function renderKPIs(data) {
    const { ontime, fillrate, vehicles } = data;

    // Ontime KPI
    const ontimeRate = ontime.overall.ontime_rate;
    animateCount($('#kpiOntimeValue'), ontimeRate * 100, '%', 1);
    $('#kpiOntimeSub').textContent = fmtNum(ontime.overall.total_trips) + ' chuyến';

    // Fill Rate KPI
    const frKg = fillrate.overall.fillrate_kg;
    const frDon = fillrate.overall.fillrate_don;
    animateCount($('#kpiFillrateValue'), frKg * 100, '%', 1);
    $('#kpiFillrateSub').textContent = 'KG: ' + fmtPct(frKg) + ' | Đơn: ' + fmtPct(frDon);

    // Vehicles KPI
    const totalV = vehicles.summary.total_vehicles;
    animateCount($('#kpiVehiclesValue'), totalV, '');
    $('#kpiVehiclesSub').textContent = 'Biển số duy nhất | TB ' + fmtDec(vehicles.summary.avg_trips_per_day) + ' chuyến/ngày';

    // ─── DYNAMIC N-1 COMPARISON ─────────────────────────────
    let prevData = null;
    let compareText = '';

    if (filterMode === 'single') {
      const prevDate = getPrevDateISO(selectedDate);
      if (prevDate >= MIN_DATE) {
        prevData = getFilteredDataForDate(prevDate, prevDate);
        compareText = `so với ngày trước (${shortDate(prevDate)})`;
      }
    } else if (filterMode === 'range') {
      const len = Math.round((new Date(endDateVal) - new Date(startDateVal)) / (1000 * 60 * 60 * 24)) + 1;
      const prevStart = new Date(startDateVal);
      prevStart.setDate(prevStart.getDate() - len);
      const prevEnd = new Date(startDateVal);
      prevEnd.setDate(prevEnd.getDate() - 1);
      
      const prevStartStr = formatDateISO(prevStart);
      const prevEndStr = formatDateISO(prevEnd);
      
      if (prevStartStr >= MIN_DATE) {
        prevData = getFilteredDataForDate(prevStartStr, prevEndStr);
        compareText = `so với ${len} ngày trước`;
      }
    }

    renderComparison('kpiOntimeCompare', ontimeRate, prevData ? prevData.ontime.overall.ontime_rate : null, compareText);
    renderComparison('kpiFillrateCompare', frKg, prevData ? prevData.fillrate.overall.fillrate_kg : null, compareText);
    renderComparison('kpiVehiclesCompare', totalV, prevData ? prevData.vehicles.summary.total_vehicles : null, compareText, false);

    // ─── DYNAMIC ROUTE BREAKDOWN DETAILS ─────────────────────
    renderWorstRouteDetail('kpiOntimeRouteDetail', ontime.top10_worst_routes, 'Tuyến tệ nhất', '%Ontime', true);
    renderWorstRouteDetail('kpiFillrateRouteDetail', fillrate.top10_worst_routes, 'Tuyến tệ nhất', '%KG', false);
    
    // Vehicles Worst Route: show least used vehicle
    if (vehicles.top15_least_used && vehicles.top15_least_used.length > 0) {
      const leastUsed = vehicles.top15_least_used[0];
      $('#kpiVehiclesRouteDetail').innerHTML = `<span class="worst-badge">Ít HĐ nhất:</span> ${leastUsed.plate} (${leastUsed.trips} chuyến, ${fmtDec(leastUsed.km_per_day, 0)} km/ngày)`;
    } else {
      $('#kpiVehiclesRouteDetail').textContent = 'Mọi xe hoạt động bình thường';
    }

    // Last updated
    const lastUpdated = ontime.metadata.generated_at || fillrate.metadata.generated_at || '';
    if ($('#lastUpdatedTime')) {
      $('#lastUpdatedTime').textContent = 'Cập nhật: ' + formatTimestamp(lastUpdated);
    }
  }

  function getPrevDateISO(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    d.setDate(d.getDate() - 1);
    return formatDateISO(d);
  }

  function renderComparison(elementId, currentVal, prevVal, compareText, isPercent = true) {
    const el = $('#' + elementId);
    if (!el) return;
    
    if (prevVal == null || isNaN(prevVal) || currentVal == null || isNaN(currentVal)) {
      el.innerHTML = `<span class="compare-label">Lũy kế toàn tháng — Chọn "Xem theo ngày" để so sánh N-1</span>`;
      el.className = 'kpi-compare-row neutral';
      el.onclick = function() {
        filterMode = 'single';
        selectedDate = MAX_DATE;
        handleDateChange();
      };
      return;
    }

    const diff = currentVal - prevVal;
    const diffPctStr = isPercent ? (diff * 100).toFixed(1) + '%' : (diff > 0 ? '+' : '') + diff.toLocaleString('vi-VN');
    const displayDiff = diff > 0 ? `▲ +${diffPctStr}` : (diff < 0 ? `▼ ${diffPctStr}` : `■ 0.0%`);
    
    let stateClass = 'neutral';
    if (diff > 0) stateClass = 'up';
    if (diff < 0) stateClass = 'down';

    el.innerHTML = `<span class="compare-badge">${displayDiff}</span> <span class="compare-text">${compareText}</span>`;
    el.className = `kpi-compare-row ${stateClass}`;
    el.onclick = null;
  }

  function renderWorstRouteDetail(elementId, worstRoutesArray, prefix, label, isOntime = true) {
    const el = $('#' + elementId);
    if (!el) return;
    
    if (!worstRoutesArray || worstRoutesArray.length === 0) {
      el.textContent = 'Không có tuyến vi phạm';
      return;
    }
    
    // Show up to 3 worst routes
    const top3 = worstRoutesArray.slice(0, 3);
    const parts = top3.map((item, i) => {
      const name = item.route;
      const val = isOntime ? (item.ontime_rate * 100).toFixed(1) + '%' : (item.fillrate_kg * 100).toFixed(1) + '%';
      return `<span class="worst-badge">${i + 1}.</span> ${name} <span style="color:var(--danger);font-weight:700">(${val})</span>`;
    });
    
    el.innerHTML = `<span style="font-weight:700;color:var(--accent-secondary)">${prefix}:</span> ${parts.join(' · ')}`;
  }


  // ═══════════════════════════════════════════════════════════
  //  TAB 1: ONTIME CHARTS & TABLES
  // ═══════════════════════════════════════════════════════════

  function renderOntimeTab(ontime) {
    renderOntimeTrend(ontime.daily);
    renderOntimeLaneDonut(ontime.by_lane_type, ontime.overall.ontime_rate);
    renderOntimePartnerTypeDonut(ontime.by_partner_type, ontime.overall.ontime_rate);
    renderOntimePartnerBar(ontime.by_partner);
    renderOntimeProvinceBar(ontime.by_province);
    renderOntimeWorstTable(ontime.top10_worst_routes);
  }

  // --- Trend Line ---
  function renderOntimeTrend(daily) {
    const labels = daily.map((d) => shortDate(d.date));
    const values = daily.map((d) => +(d.ontime_rate * 100).toFixed(2));

    charts.ontimeTrend = new Chart($('#chartOntimeTrend'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ontime %',
          data: values,
          borderColor: '#f26522',
          backgroundColor: createGradientFill('#chartOntimeTrend', '#f26522'),
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f26522',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          borderWidth: 2.5
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => 'Ontime: ' + ctx.parsed.y.toFixed(1) + '%'
            }
          },
          annotation: {
            annotations: {
              thresholdLine: {
                type: 'line',
                yMin: 90,
                yMax: 90,
                borderColor: 'rgba(248, 113, 113, 0.5)',
                borderWidth: 2,
                borderDash: [8, 4],
                label: {
                  display: true,
                  content: 'Ngưỡng 90%',
                  position: 'end',
                  backgroundColor: 'rgba(248, 113, 113, 0.12)',
                  color: '#f87171',
                  font: { size: 11, weight: '500' },
                  padding: 4
                }
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: Math.max(0, Math.min(...values) - 5),
            max: 100,
            ticks: { callback: (v) => v + '%' }
          }
        }
      }
    });
  }

  // --- Donut: by Lane Type ---
  function renderOntimeLaneDonut(byLane, overallRate) {
    const labels = byLane.map((d) => d.lane_type);
    const values = byLane.map((d) => d.trips);
    const colors = CHART_COLORS.slice(0, byLane.length);

    charts.ontimeLane = new Chart($('#chartOntimeLane'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = byLane[ctx.dataIndex];
                return item.lane_type + ': ' + fmtPct(item.ontime_rate) + ' (' + fmtNum(item.trips) + ' chuyến)';
              }
            }
          }
        }
      },
      plugins: [centerTextPlugin(fmtPct(overallRate, 1))]
    });
  }

  // --- Donut: by Partner Type ---
  function renderOntimePartnerTypeDonut(byPType, overallRate) {
    const labels = byPType.map((d) => d.partner_type);
    const values = byPType.map((d) => d.trips);
    const colors = [CHART_COLORS[1], CHART_COLORS[4]];

    charts.ontimePartnerType = new Chart($('#chartOntimePartnerType'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = byPType[ctx.dataIndex];
                return item.partner_type + ': ' + fmtPct(item.ontime_rate) + ' (' + fmtNum(item.trips) + ' chuyến)';
              }
            }
          }
        }
      },
      plugins: [centerTextPlugin(fmtPct(overallRate, 1))]
    });
  }

  // --- Horizontal Bar: by Partner (sorted ascending) ---
  function renderOntimePartnerBar(byPartner) {
    const sorted = [...byPartner].sort((a, b) => a.ontime_rate - b.ontime_rate);
    const labels = sorted.map((d) => d.partner);
    const values = sorted.map((d) => +(d.ontime_rate * 100).toFixed(1));
    const bgColors = sorted.map((d) => ontimeColor(d.ontime_rate));

    // Dynamic height
    const wrapper = $('#chartOntimePartnerWrapper');
    wrapper.style.height = Math.max(350, sorted.length * 32) + 'px';

    charts.ontimePartner = new Chart($('#chartOntimePartner'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ontime %',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'right',
            color: '#1e272e',
            font: { family: 'Inter', weight: '600', size: 9 },
            formatter: (v) => v.toFixed(1) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = sorted[ctx.dataIndex];
                return 'Ontime: ' + fmtPct(item.ontime_rate) + ' | ' + fmtNum(item.trips) + ' chuyến';
              }
            }
          }
        },
        scales: {
          x: {
            min: 0, max: 100,
            ticks: { callback: (v) => v + '%' }
          },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // --- Bar: by Province ---
  function renderOntimeProvinceBar(byProvince) {
    const sorted = [...byProvince].sort((a, b) => a.ontime_rate - b.ontime_rate);
    const labels = sorted.map((d) => d.province);
    const values = sorted.map((d) => +(d.ontime_rate * 100).toFixed(1));
    const bgColors = sorted.map((d) => ontimeColor(d.ontime_rate));

    const wrapper = $('#chartOntimeProvinceWrapper');
    wrapper.style.height = Math.max(350, sorted.length * 36) + 'px';

    charts.ontimeProvince = new Chart($('#chartOntimeProvince'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ontime %',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
          barThickness: 22
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'top',
            color: '#1e272e',
            font: { family: 'Inter', weight: '600', size: 9 },
            formatter: (v) => v.toFixed(1) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = sorted[ctx.dataIndex];
                return 'Ontime: ' + fmtPct(item.ontime_rate) + ' | ' + fmtNum(item.trips) + ' chuyến';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: 0, max: 100,
            ticks: { callback: (v) => v + '%' }
          }
        }
      }
    });
  }

  // --- Table: Top 10 Worst Ontime Routes ---
  function renderOntimeWorstTable(routes) {
    const tbody = $('#tableOntimeWorst tbody');
    tbody.innerHTML = routes.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="fw-600">${r.route}</td>
        <td>${r.lane_type || '—'}</td>
        <td>${r.partner || '—'}</td>
        <td class="text-right">${fmtNum(r.trips)}</td>
        <td><span class="badge ${ontimeClass(r.ontime_rate)}">${fmtPct(r.ontime_rate)}</span></td>
      </tr>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  TAB 2: FILL RATE CHARTS & TABLES
  // ═══════════════════════════════════════════════════════════

  function renderFillrateTab(fillrate) {
    renderFillrateTrend(fillrate.daily);
    renderFillrateLaneBar(fillrate.by_lane_type);
    renderFillrateNCCBar(fillrate.by_ncc);
    renderFillrateWorstTable(fillrate.top10_worst_routes);
  }

  // --- Dual Line: Trend ---
  function renderFillrateTrend(daily) {
    const labels = daily.map((d) => shortDate(d.date));
    const kgVals = daily.map((d) => +(d.fillrate_kg * 100).toFixed(2));
    const donVals = daily.map((d) => +(d.fillrate_don * 100).toFixed(2));

    charts.fillrateTrend = new Chart($('#chartFillrateTrend'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Lấp đầy KG',
            data: kgVals,
            borderColor: '#f26522',
            backgroundColor: 'rgba(0,229,160,0.06)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#f26522',
            borderWidth: 2.5
          },
          {
            label: 'Lấp đầy Đơn',
            data: donVals,
            borderColor: '#005691',
            backgroundColor: 'rgba(124,92,252,0.06)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#005691',
            borderWidth: 2.5
          }
        ]
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'
            }
          },
          annotation: {
            annotations: {
              thresholdLine: {
                type: 'line',
                yMin: 50,
                yMax: 50,
                borderColor: 'rgba(248, 113, 113, 0.4)',
                borderWidth: 2,
                borderDash: [8, 4],
                label: {
                  display: true,
                  content: 'Ngưỡng 50%',
                  position: 'end',
                  backgroundColor: 'rgba(248, 113, 113, 0.12)',
                  color: '#f87171',
                  font: { size: 11, weight: '500' },
                  padding: 4
                }
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: 0,
            max: 100,
            ticks: { callback: (v) => v + '%' }
          }
        }
      }
    });
  }

  // --- Grouped Bar: by Lane Type ---
  function renderFillrateLaneBar(byLane) {
    const labels = byLane.map((d) => d.lane_type);

    charts.fillrateLane = new Chart($('#chartFillrateLane'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Lấp đầy KG',
            data: byLane.map((d) => +(d.fillrate_kg * 100).toFixed(1)),
            backgroundColor: '#f26522',
            borderRadius: 6
          },
          {
            label: 'Lấp đầy Đơn',
            data: byLane.map((d) => +(d.fillrate_don * 100).toFixed(1)),
            backgroundColor: '#005691',
            borderRadius: 6
          }
        ]
      },
      options: {
        plugins: {
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'top',
            color: '#1e272e',
            font: { family: 'Inter', weight: '600', size: 9 },
            formatter: (v) => v.toFixed(1) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            min: 0, max: 100,
            ticks: { callback: (v) => v + '%' }
          }
        }
      }
    });
  }

  // --- Horizontal Bar: by NCC ---
  function renderFillrateNCCBar(byNCC) {
    const sorted = [...byNCC].sort((a, b) => a.fillrate_kg - b.fillrate_kg).slice(0, 20);
    const labels = sorted.map((d) => d.ncc);
    const values = sorted.map((d) => +(d.fillrate_kg * 100).toFixed(1));
    const bgColors = sorted.map((d) => fillrateColor(d.fillrate_kg));

    const wrapper = $('#chartFillrateNCCWrapper');
    wrapper.style.height = Math.max(350, sorted.length * 32) + 'px';

    charts.fillrateNCC = new Chart($('#chartFillrateNCC'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Lấp đầy KG %',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'right',
            color: '#1e272e',
            font: { family: 'Inter', weight: '600', size: 9 },
            formatter: (v) => v.toFixed(1) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = sorted[ctx.dataIndex];
                return 'KG: ' + fmtPct(item.fillrate_kg) + ' | Đơn: ' + fmtPct(item.fillrate_don) + ' | ' + fmtNum(item.trips) + ' chuyến';
              }
            }
          }
        },
        scales: {
          x: {
            min: 0, max: 100,
            ticks: { callback: (v) => v + '%' }
          },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // --- Table: Top 10 Worst Fill Rate Routes ---
  function renderFillrateWorstTable(routes) {
    const tbody = $('#tableFillrateWorst tbody');
    tbody.innerHTML = routes.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="fw-600">${r.route}</td>
        <td>${r.lane_type || '—'}</td>
        <td>${r.ncc || '—'}</td>
        <td class="text-right">${fmtNum(r.trips)}</td>
        <td><span class="badge ${fillrateClass(r.fillrate_kg)}">${fmtPct(r.fillrate_kg)}</span></td>
        <td><span class="badge ${fillrateClass(r.fillrate_don)}">${fmtPct(r.fillrate_don)}</span></td>
      </tr>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  TAB 3: VEHICLES CHARTS & TABLES
  // ═══════════════════════════════════════════════════════════

  function renderVehiclesTab(vehicles) {
    renderVehicleMetrics(vehicles.summary);
    renderVehicleTrend(vehicles.daily_usage);
    renderVehicleCapacityDonut(vehicles.by_load_capacity);
    renderVehicleTopBar(vehicles.top15_most_used);
    renderVehicleLeastUsedTable(vehicles.top15_least_used);
    renderVehicleAnomalyTable(vehicles.anomaly_vehicles);
  }

  // --- Metric Cards ---
  function renderVehicleMetrics(summary) {
    animateCount($('#metricTotalVehicles'), summary.total_vehicles, '');
    animateCount($('#metricAvgTrips'), summary.avg_trips_per_day, '', 2);
    animateCount($('#metricAvgKm'), summary.avg_km_per_day, '', 1);
    animateCount($('#metricAnomaly'), summary.anomaly_count, '');
  }

  // --- Multi-axis Line: Daily Usage ---
  function renderVehicleTrend(dailyUsage) {
    const labels = dailyUsage.map((d) => shortDate(d.date));

    charts.vehicleTrend = new Chart($('#chartVehicleTrend'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Số xe hoạt động',
            data: dailyUsage.map((d) => d.active_vehicles),
            backgroundColor: 'rgba(124, 92, 252, 0.15)',
            borderColor: 'rgba(124, 92, 252, 0.3)',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'yVehicles',
            order: 3
          },
          {
            type: 'line',
            label: 'TB Chuyến/xe',
            data: dailyUsage.map((d) => d.avg_trips_per_vehicle),
            borderColor: '#f26522',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#f26522',
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2.5,
            tension: 0.35,
            yAxisID: 'yTrips',
            order: 1
          },
          {
            type: 'line',
            label: 'TB Km',
            data: dailyUsage.map((d) => d.avg_km),
            borderColor: '#005691',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#005691',
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2.5,
            tension: 0.35,
            yAxisID: 'yKm',
            order: 2
          }
        ]
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y;
                if (ctx.dataset.label === 'TB Km') return 'TB Km: ' + fmtDec(val, 1);
                if (ctx.dataset.label === 'TB Chuyến/xe') return 'TB Chuyến/xe: ' + fmtDec(val, 2);
                return 'Xe HĐ: ' + fmtNum(val);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          yTrips: {
            position: 'left',
            title: { display: true, text: 'Chuyến/xe', color: '#f26522' },
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { color: '#f26522' }
          },
          yKm: {
            position: 'right',
            title: { display: true, text: 'Km', color: '#005691' },
            grid: { display: false },
            ticks: { color: '#005691' }
          },
          yVehicles: {
            display: false
          }
        }
      }
    });
  }

  // --- Donut: by Load Capacity ---
  function renderVehicleCapacityDonut(byCapacity) {
    const labels = byCapacity.map((d) => d.capacity);
    const values = byCapacity.map((d) => d.count);
    const colors = CHART_COLORS.slice(0, byCapacity.length);

    charts.vehicleCapacity = new Chart($('#chartVehicleCapacity'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = byCapacity[ctx.dataIndex];
                return item.capacity + ': ' + fmtNum(item.count) + ' xe (' + fmtPct(item.percentage) + ')';
              }
            }
          }
        }
      }
    });
  }

  // --- Horizontal Bar: Top 15 Most Used ---
  function renderVehicleTopBar(topMost) {
    const labels = topMost.map((d) => d.plate);
    const values = topMost.map((d) => d.trips);

    const wrapper = $('#chartVehicleTopWrapper');
    wrapper.style.height = Math.max(350, topMost.length * 30) + 'px';

    charts.vehicleTop = new Chart($('#chartVehicleTop'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Số chuyến',
          data: values,
          backgroundColor: CHART_COLORS.slice(0, topMost.length).map((c) => c + 'cc'),
          borderRadius: 4,
          barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'right',
            color: '#1e272e',
            font: { family: 'Inter', weight: '600', size: 9 },
            formatter: (v) => v.toLocaleString()
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = topMost[ctx.dataIndex];
                return fmtNum(item.trips) + ' chuyến | ' + fmtDec(item.trips_per_day) + ' chuyến/ngày | ' + fmtDec(item.km_per_day, 1) + ' km/ngày';
              }
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // --- Table: Top 15 Least Used ---
  function renderVehicleLeastUsedTable(leastUsed) {
    const tbody = $('#tableLeastUsed tbody');
    tbody.innerHTML = leastUsed.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="fw-600">${v.plate}</td>
        <td class="text-right">${fmtNum(v.trips)}</td>
        <td class="text-right">${fmtNum(v.days_active)}</td>
        <td class="text-right">${fmtDec(v.trips_per_day)}</td>
        <td class="text-right">${fmtDec(v.km_per_day, 1)}</td>
        <td class="text-right">${fmtDec(v.total_km, 1)}</td>
      </tr>
    `).join('');
  }

  // --- Table: Anomaly Vehicles ---
  function renderVehicleAnomalyTable(anomalies) {
    const tbody = $('#tableAnomaly tbody');
    if (!anomalies || anomalies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">Không có xe bất thường</td></tr>';
      return;
    }
    tbody.innerHTML = anomalies.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="fw-600">${v.plate}</td>
        <td class="text-warning">${v.reason}</td>
        <td class="text-right">${fmtNum(v.trips)}</td>
        <td class="text-right">${fmtNum(v.days_active)}</td>
        <td class="text-right">${fmtDec(v.trips_per_day)}</td>
        <td class="text-right">${fmtDec(v.km_per_day, 1)}</td>
      </tr>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  CHART HELPERS
  // ═══════════════════════════════════════════════════════════

  /** Create a vertical gradient fill for line charts */
  function createGradientFill(canvasSelector, hexColor) {
    const canvas = $(canvasSelector);
    if (!canvas) return hexColor;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 320);
    gradient.addColorStop(0, hexColor + '40');
    gradient.addColorStop(1, hexColor + '00');
    return gradient;
  }

  /** Plugin to draw text in the center of a doughnut chart */
  function centerTextPlugin(text) {
    return {
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "700 22px 'Inter', sans-serif";
        ctx.fillStyle = '#1e272e';
        ctx.fillText(text, centerX, centerY);
        ctx.restore();
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  DETAIL TABLES WITH SEARCH
  // ═══════════════════════════════════════════════════════════

  async function loadDetailData() {
    try {
      const [ontimeDetail, fillDetail] = await Promise.all([
        loadJSON('data/ontime_detail.json'),
        loadJSON('data/fillrate_detail.json')
      ]);
      ontimeDetailData = ontimeDetail;
      ontimeFilteredData = [...ontimeDetailData];
      fillDetailData = fillDetail;
      fillFilteredData = [...fillDetailData];

      renderOntimeDetailPage();
      renderFillDetailPage();
      initDetailSearch();
    } catch (err) {
      console.warn('Detail data not available:', err.message);
      // Hide detail sections if data unavailable
      document.querySelectorAll('.detail-section').forEach(s => s.style.display = 'none');
    }
  }

  // ─── ONTIME DETAIL TABLE ────────────────────────────

  function filterOntimeDetail() {
    const codeVal = ($('#searchOntimeCode')?.value || '').trim().toUpperCase();
    const plateVal = ($('#searchOntimePlate')?.value || '').trim().toUpperCase();
    const nccVal = ($('#searchOntimeNCC')?.value || '').trim().toUpperCase();

    ontimeFilteredData = ontimeDetailData.filter(row => {
      if (codeVal && !row.code.toUpperCase().includes(codeVal)) return false;
      if (plateVal && !row.plate.toUpperCase().includes(plateVal)) return false;
      if (nccVal && !row.partner.toUpperCase().includes(nccVal)) return false;
      return true;
    });

    ontimeCurrentPage = 1;
    renderOntimeDetailPage();
  }

  function renderOntimeDetailPage() {
    const total = ontimeFilteredData.length;
    const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    const start = (ontimeCurrentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, total);
    const pageData = ontimeFilteredData.slice(start, end);

    const tbody = $('#tableOntimeDetail tbody');
    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:24px; color:rgba(255,255,255,0.4)">Không tìm thấy kết quả</td></tr>';
    } else {
      tbody.innerHTML = pageData.map(r => `
        <tr>
          <td class="code-cell">${r.code}</td>
          <td>${r.date}</td>
          <td>${r.lane}</td>
          <td>${r.partner}</td>
          <td>${r.ptype}</td>
          <td>${r.route || '—'}</td>
          <td class="plate-cell">${r.plate}</td>
          <td class="text-right">${r.faults}</td>
          <td class="text-right">${r.stops}</td>
          <td><span class="badge ${ontimeClass(r.ontime)}">${fmtPct(r.ontime)}</span></td>
        </tr>
      `).join('');
    }

    // Update info & pagination
    $('#ontimeDetailCount').textContent = `Hiển thị ${total > 0 ? start + 1 : 0}–${end} / ${fmtNum(total)} chuyến`;
    $('#ontimePageInfo').textContent = `Trang ${ontimeCurrentPage} / ${totalPages}`;
    $('#ontimePrevBtn').disabled = ontimeCurrentPage <= 1;
    $('#ontimeNextBtn').disabled = ontimeCurrentPage >= totalPages;
  }

  // ─── FILLRATE DETAIL TABLE ──────────────────────────

  function filterFillDetail() {
    const codeVal = ($('#searchFillCode')?.value || '').trim().toUpperCase();
    const plateVal = ($('#searchFillPlate')?.value || '').trim().toUpperCase();
    const nccVal = ($('#searchFillNCC')?.value || '').trim().toUpperCase();

    fillFilteredData = fillDetailData.filter(row => {
      if (codeVal && !row.code.toUpperCase().includes(codeVal)) return false;
      if (plateVal && !row.plate.toUpperCase().includes(plateVal)) return false;
      if (nccVal && !row.ncc.toUpperCase().includes(nccVal)) return false;
      return true;
    });

    fillCurrentPage = 1;
    renderFillDetailPage();
  }

  function renderFillDetailPage() {
    const total = fillFilteredData.length;
    const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    const start = (fillCurrentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, total);
    const pageData = fillFilteredData.slice(start, end);

    const tbody = $('#tableFillDetail tbody');
    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:24px; color:rgba(255,255,255,0.4)">Không tìm thấy kết quả</td></tr>';
    } else {
      tbody.innerHTML = pageData.map(r => `
        <tr>
          <td class="code-cell">${r.code}</td>
          <td>${r.date}</td>
          <td>${r.route || '—'}</td>
          <td>${r.lane}</td>
          <td>${r.ncc}</td>
          <td class="plate-cell">${r.plate}</td>
          <td class="text-right">${fmtNum(r.cap)}</td>
          <td class="text-right">${fmtDec(r.km, 1)}</td>
          <td><span class="badge ${fillrateClass(r.fr_kg)}">${fmtPct(r.fr_kg)}</span></td>
          <td><span class="badge ${fillrateClass(r.fr_don)}">${fmtPct(r.fr_don)}</span></td>
        </tr>
      `).join('');
    }

    $('#fillDetailCount').textContent = `Hiển thị ${total > 0 ? start + 1 : 0}–${end} / ${fmtNum(total)} chuyến`;
    $('#fillPageInfo').textContent = `Trang ${fillCurrentPage} / ${totalPages}`;
    $('#fillPrevBtn').disabled = fillCurrentPage <= 1;
    $('#fillNextBtn').disabled = fillCurrentPage >= totalPages;
  }

  // ─── SEARCH EVENT HANDLERS ──────────────────────────

  function initDetailSearch() {
    // Debounced search for Ontime
    let ontimeDebounce;
    ['searchOntimeCode', 'searchOntimePlate', 'searchOntimeNCC'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          clearTimeout(ontimeDebounce);
          ontimeDebounce = setTimeout(filterOntimeDetail, 250);
        });
      }
    });

    // Debounced search for Fill Rate
    let fillDebounce;
    ['searchFillCode', 'searchFillPlate', 'searchFillNCC'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          clearTimeout(fillDebounce);
          fillDebounce = setTimeout(filterFillDetail, 250);
        });
      }
    });

    // Clear buttons
    const clearOntime = $('#clearOntimeSearch');
    if (clearOntime) {
      clearOntime.addEventListener('click', () => {
        $('#searchOntimeCode').value = '';
        $('#searchOntimePlate').value = '';
        $('#searchOntimeNCC').value = '';
        filterOntimeDetail();
      });
    }

    const clearFill = $('#clearFillSearch');
    if (clearFill) {
      clearFill.addEventListener('click', () => {
        $('#searchFillCode').value = '';
        $('#searchFillPlate').value = '';
        $('#searchFillNCC').value = '';
        filterFillDetail();
      });
    }

    // Pagination buttons
    const ontimePrev = $('#ontimePrevBtn');
    const ontimeNext = $('#ontimeNextBtn');
    if (ontimePrev) ontimePrev.addEventListener('click', () => { ontimeCurrentPage--; renderOntimeDetailPage(); });
    if (ontimeNext) ontimeNext.addEventListener('click', () => { ontimeCurrentPage++; renderOntimeDetailPage(); });

    const fillPrev = $('#fillPrevBtn');
    const fillNext = $('#fillNextBtn');
    if (fillPrev) fillPrev.addEventListener('click', () => { fillCurrentPage--; renderFillDetailPage(); });
    if (fillNext) fillNext.addEventListener('click', () => { fillCurrentPage++; renderFillDetailPage(); });

    // Download CSV buttons
    const dlOntime = $('#downloadOntimeCSV');
    if (dlOntime) dlOntime.addEventListener('click', downloadOntimeCSV);
    const dlFill = $('#downloadFillCSV');
    if (dlFill) dlFill.addEventListener('click', downloadFillCSV);
  }

  // ─── CSV DOWNLOAD UTILITIES ─────────────────────────

  function escapeCSV(val) {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function triggerDownload(csvContent, filename) {
    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadOntimeCSV() {
    const data = ontimeFilteredData;
    if (data.length === 0) return;

    const headers = ['Mã Chuyến', 'Ngày', 'Loại Tuyến', 'NCC', 'Loại ĐT', 'Tuyến', 'Biển Số', 'Điểm Lỗi', 'Điểm Dừng', '%Ontime'];
    const rows = data.map(r => [
      escapeCSV(r.code),
      escapeCSV(r.date),
      escapeCSV(r.lane),
      escapeCSV(r.partner),
      escapeCSV(r.ptype),
      escapeCSV(r.route),
      escapeCSV(r.plate),
      r.faults,
      r.stops,
      r.ontime != null ? (r.ontime * 100).toFixed(1) + '%' : ''
    ].join(','));

    const csv = headers.join(',') + '\n' + rows.join('\n');
    const isFiltered = ontimeFilteredData.length < ontimeDetailData.length;
    const filename = isFiltered
      ? `ontime_filtered_${ontimeFilteredData.length}.csv`
      : 'ontime_chi_tiet.csv';
    triggerDownload(csv, filename);
  }

  function downloadFillCSV() {
    const data = fillFilteredData;
    if (data.length === 0) return;

    const headers = ['Mã Chuyến', 'Ngày', 'Mã Tuyến', 'Loại Tuyến', 'NCC', 'Biển Số', 'Tải Trọng', 'Km', 'Lấp Đầy (kg)', 'Lấp Đầy (đơn)'];
    const rows = data.map(r => [
      escapeCSV(r.code),
      escapeCSV(r.date),
      escapeCSV(r.route),
      escapeCSV(r.lane),
      escapeCSV(r.ncc),
      escapeCSV(r.plate),
      r.cap != null ? r.cap : '',
      r.km != null ? r.km : '',
      r.fr_kg != null ? (r.fr_kg * 100).toFixed(1) + '%' : '',
      r.fr_don != null ? (r.fr_don * 100).toFixed(1) + '%' : ''
    ].join(','));

    const csv = headers.join(',') + '\n' + rows.join('\n');
    const isFiltered = fillFilteredData.length < fillDetailData.length;
    const filename = isFiltered
      ? `lapday_filtered_${fillFilteredData.length}.csv`
      : 'lapday_chi_tiet.csv';
    triggerDownload(csv, filename);
  }

  // ═══════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function initRefreshButton() {
    const btnRefresh = $('#btnRefreshData');
    const ssoModal = $('#ssoModal');
    const btnCloseSsoModal = $('#btnCloseSsoModal');
    const btnCancelSso = $('#btnCancelSso');
    const btnSaveSso = $('#btnSaveSso');
    const inputSessionToken = $('#inputSessionToken');
    const inputApiUrl = $('#inputApiUrl');
    const btnOpenSettings = $('#btnOpenSettings');

    if (!btnRefresh) return;

    // Helper to get base API URL dynamically
    function getApiUrl(endpoint) {
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (isLocal) {
        return endpoint;
      }
      
      let tunnelUrl = localStorage.getItem('api_tunnel_url') || '';
      if (tunnelUrl) {
        if (tunnelUrl.endsWith('/')) {
          tunnelUrl = tunnelUrl.slice(0, -1);
        }
        return tunnelUrl + endpoint;
      }
      return null;
    }

    // Helper to open modal
    function openSsoModal() {
      if (ssoModal) {
        ssoModal.classList.add('active');
        if (inputSessionToken) {
          inputSessionToken.value = '';
        }
        if (inputApiUrl) {
          inputApiUrl.value = localStorage.getItem('api_tunnel_url') || '';
        }
      }
    }

    // Helper to close modal
    function closeSsoModal() {
      if (ssoModal) ssoModal.classList.remove('active');
    }

    if (btnCloseSsoModal) btnCloseSsoModal.addEventListener('click', closeSsoModal);
    if (btnCancelSso) btnCancelSso.addEventListener('click', closeSsoModal);
    if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSsoModal);

    // Save token and settings from modal and run sync
    if (btnSaveSso) {
      btnSaveSso.addEventListener('click', async () => {
        const token = inputSessionToken ? inputSessionToken.value.trim() : '';
        const apiUrlVal = inputApiUrl ? inputApiUrl.value.trim() : '';

        // Save Tunnel URL to localstorage
        if (apiUrlVal) {
          localStorage.setItem('api_tunnel_url', apiUrlVal);
        } else {
          localStorage.removeItem('api_tunnel_url');
        }

        // Check if we are running online and no token is entered, we can just save the API URL
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (!isLocal && !apiUrlVal) {
          alert('Vui lòng cấu hình Đường dẫn kết nối Máy chủ API để chạy online!');
          return;
        }

        if (!token) {
          alert('✓ Đã lưu cấu hình kết nối API Server!');
          closeSsoModal();
          return;
        }

        btnSaveSso.disabled = true;
        const origBtnText = btnSaveSso.textContent;
        btnSaveSso.textContent = 'Đang lưu token...';

        try {
          const apiSaveUrl = getApiUrl('/api/save_session');
          if (!apiSaveUrl) {
            alert('✗ Chưa cấu hình đường dẫn máy chủ API!');
            return;
          }

          // Save session token to backend .env
          const saveResp = await fetch(apiSaveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: token })
          });
          const saveRes = await saveResp.json();

          if (saveRes.success) {
            btnSaveSso.textContent = 'Đang đồng bộ dữ liệu...';
            
            const apiRefreshUrl = getApiUrl('/api/refresh');
            // Now run direct refresh
            const refreshResp = await fetch(apiRefreshUrl, { method: 'POST' });
            const refreshRes = await refreshResp.json();

            if (refreshRes.success) {
              alert('✓ Đồng bộ dữ liệu thành công!');
              closeSsoModal();
              location.reload();
            } else {
              alert('✗ Đồng bộ thất bại! Phiên cookie bạn nhập có thể đã hết hạn hoặc không chính xác. Vui lòng kiểm tra lại.');
            }
          } else {
            alert('✗ Không thể lưu cấu hình cookie lên máy chủ: ' + (saveRes.error || 'Lỗi không rõ'));
          }
        } catch (err) {
          console.error(err);
          alert('✗ Có lỗi xảy ra trong quá trình đồng bộ!');
        } finally {
          btnSaveSso.disabled = false;
          btnSaveSso.textContent = origBtnText;
        }
      });
    }

    // Click handler for refresh button
    btnRefresh.addEventListener('click', async () => {
      if (btnRefresh.disabled) return;

      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const apiRefreshUrl = getApiUrl('/api/refresh');

      if (!isLocal && !apiRefreshUrl) {
        alert('Cảnh báo: Bạn đang truy cập trực tuyến. Vui lòng nhấp vào biểu tượng bánh răng ⚙️ bên cạnh để cấu hình đường dẫn API Secure Tunnel của máy chủ!');
        openSsoModal();
        return;
      }

      btnRefresh.disabled = true;
      btnRefresh.classList.add('spinning');
      const textSpan = btnRefresh.querySelector('.refresh-text');
      const origText = textSpan ? textSpan.textContent : 'Làm mới';
      if (textSpan) textSpan.textContent = 'Đang đồng bộ...';

      try {
        const resp = await fetch(apiRefreshUrl, { method: 'POST' });
        const res = await resp.json();

        if (res.success) {
          alert('✓ Đồng bộ dữ liệu thành công!');
          location.reload();
        } else {
          // If fail, open the cookie configuration modal directly!
          openSsoModal();
        }
      } catch (err) {
        console.error(err);
        if (!isLocal) {
          alert('✗ Không thể kết nối với máy chủ API.\nVui lòng đảm bảo:\n1. Server.py đang chạy trên máy tính của bạn.\n2. Secure Tunnel (localhost.run) đang mở.\n3. Đường dẫn API Tunnel của bạn đã chính xác và chưa hết hạn.');
        } else {
          alert('✗ Không thể kết nối với máy chủ cục bộ.\nVui lòng đảm bảo bạn đang chạy python server.py chứ không phải python -m http.server.');
        }
      } finally {
        btnRefresh.disabled = false;
        btnRefresh.classList.remove('spinning');
        if (textSpan) textSpan.textContent = origText;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  GLOBAL DATE FILTER LOGIC
  // ═══════════════════════════════════════════════════════════

  function destroyAllCharts() {
    for (const key in charts) {
      if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
      }
    }
  }

  function formatVietnameseDate(dateStr) {
    if (!dateStr) return 'Cả tháng MTD';
    const dateObj = new Date(dateStr);
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const dayName = days[dateObj.getDay()];
    const parts = dateStr.split('-');
    return `${dayName}, ${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function isShortDateInRange(shortDateStr, startISO, endISO) {
    const day = parseInt(shortDateStr.split('/')[0], 10);
    const startDay = parseInt(startISO.split('-')[2], 10);
    const endDay = parseInt(endISO.split('-')[2], 10);
    return day >= startDay && day <= endDay;
  }

  function getFilteredDataForDate(startISO, endISO) {
    if (filterMode === 'all') return rawData;
    
    // Filter ontime detail
    const dailyOntimeTrips = ontimeDetailData.filter(r => isShortDateInRange(r.date, startISO, endISO));
    const dailyFillTrips = fillDetailData.filter(r => isShortDateInRange(r.date, startISO, endISO));
    
    // Calculate overall KPIs in range
    const ontimeDailyEntries = rawData.ontime.daily.filter(d => d.date >= startISO && d.date <= endISO);
    let totalOntimeTrips = 0;
    let ontimeSum = 0;
    ontimeDailyEntries.forEach(d => {
      totalOntimeTrips += d.trips;
      ontimeSum += d.ontime_rate * d.trips;
    });
    const overallOntimeRate = totalOntimeTrips > 0 ? ontimeSum / totalOntimeTrips : 0;

    const fillDailyEntries = rawData.fillrate.daily.filter(d => d.date >= startISO && d.date <= endISO);
    let totalFillTrips = 0;
    let fillKgSum = 0;
    let fillDonSum = 0;
    fillDailyEntries.forEach(d => {
      totalFillTrips += d.trips;
      fillKgSum += d.fillrate_kg * d.trips;
      fillDonSum += d.fillrate_don * d.trips;
    });
    const overallFillKg = totalFillTrips > 0 ? fillKgSum / totalFillTrips : 0;
    const overallFillDon = totalFillTrips > 0 ? fillDonSum / totalFillTrips : 0;

    const dailyVehicles = {};
    dailyFillTrips.forEach(t => {
      if (t.plate) {
        if (!dailyVehicles[t.plate]) dailyVehicles[t.plate] = { trips: 0, total_km: 0, cap: t.cap };
        dailyVehicles[t.plate].trips++;
        dailyVehicles[t.plate].total_km += t.km;
      }
    });
    const totalVehiclesCount = Object.keys(dailyVehicles).length;
    
    const vehicleDailyEntries = rawData.vehicles.daily_usage.filter(d => d.date >= startISO && d.date <= endISO);
    let vehicleDaysCount = vehicleDailyEntries.length || 1;
    let tripsSum = 0;
    let kmSum = 0;
    vehicleDailyEntries.forEach(d => {
      tripsSum += d.avg_trips_per_vehicle;
      kmSum += d.avg_km;
    });
    const avgTripsInRange = tripsSum / vehicleDaysCount;
    const avgKmInRange = kmSum / vehicleDaysCount;

    // 1. Ontime Aggregations
    // by_lane_type
    const lanes = {};
    dailyOntimeTrips.forEach(t => {
      if (!lanes[t.lane]) lanes[t.lane] = { trips: 0, ontime_sum: 0 };
      lanes[t.lane].trips++;
      lanes[t.lane].ontime_sum += t.ontime;
    });
    const by_lane_type = Object.keys(lanes).map(lane => ({
      lane_type: lane,
      ontime_rate: lanes[lane].ontime_sum / lanes[lane].trips,
      trips: lanes[lane].trips
    }));
    
    // by_partner_type
    const ptypes = {};
    dailyOntimeTrips.forEach(t => {
      if (!ptypes[t.ptype]) ptypes[t.ptype] = { trips: 0, ontime_sum: 0 };
      ptypes[t.ptype].trips++;
      ptypes[t.ptype].ontime_sum += t.ontime;
    });
    const by_partner_type = Object.keys(ptypes).map(pt => ({
      partner_type: pt,
      ontime_rate: ptypes[pt].ontime_sum / ptypes[pt].trips,
      trips: ptypes[pt].trips
    }));
    
    // by_partner
    const partners = {};
    dailyOntimeTrips.forEach(t => {
      if (!partners[t.partner]) partners[t.partner] = { trips: 0, ontime_sum: 0 };
      partners[t.partner].trips++;
      partners[t.partner].ontime_sum += t.ontime;
    });
    const by_partner = Object.keys(partners).map(p => ({
      partner: p,
      ontime_rate: partners[p].ontime_sum / partners[p].trips,
      trips: partners[p].trips
    }));

    // by_province
    const provinces = {};
    dailyOntimeTrips.forEach(t => {
      const prov = getProvinceFromRoute(t.route);
      if (prov) {
        if (!provinces[prov]) provinces[prov] = { trips: 0, ontime_sum: 0 };
        provinces[prov].trips++;
        provinces[prov].ontime_sum += t.ontime;
      }
    });
    const by_province = Object.keys(provinces).map(prov => ({
      province: prov,
      ontime_rate: provinces[prov].ontime_sum / provinces[prov].trips,
      trips: provinces[prov].trips
    }));

    // worst routes
    const routesOntime = {};
    dailyOntimeTrips.forEach(t => {
      if (t.route) {
        if (!routesOntime[t.route]) routesOntime[t.route] = { trips: 0, ontime_sum: 0, lane: t.lane, partner: t.partner };
        routesOntime[t.route].trips++;
        routesOntime[t.route].ontime_sum += t.ontime;
      }
    });
    const worst_routes_ontime = Object.keys(routesOntime).map(r => ({
      route: r,
      lane_type: routesOntime[r].lane,
      partner: routesOntime[r].partner,
      trips: routesOntime[r].trips,
      ontime_rate: routesOntime[r].ontime_sum / routesOntime[r].trips
    })).sort((a,b) => a.ontime_rate - b.ontime_rate).slice(0, 10);

    // 2. Fillrate Aggregations
    // by_lane_type
    const fillLanes = {};
    dailyFillTrips.forEach(t => {
      if (!fillLanes[t.lane]) fillLanes[t.lane] = { trips: 0, kg_sum: 0, don_sum: 0, kg_count: 0, don_count: 0 };
      fillLanes[t.lane].trips++;
      if (t.fr_kg != null) { fillLanes[t.lane].kg_sum += t.fr_kg; fillLanes[t.lane].kg_count++; }
      if (t.fr_don != null) { fillLanes[t.lane].don_sum += t.fr_don; fillLanes[t.lane].don_count++; }
    });
    const by_lane_type_fill = Object.keys(fillLanes).map(lane => ({
      lane_type: lane,
      fillrate_kg: fillLanes[lane].kg_count > 0 ? fillLanes[lane].kg_sum / fillLanes[lane].kg_count : 0,
      fillrate_don: fillLanes[lane].don_count > 0 ? fillLanes[lane].don_sum / fillLanes[lane].don_count : 0,
      trips: fillLanes[lane].trips
    }));

    // by_ncc
    const fillNcc = {};
    dailyFillTrips.forEach(t => {
      if (!fillNcc[t.ncc]) fillNcc[t.ncc] = { trips: 0, kg_sum: 0, don_sum: 0, kg_count: 0, don_count: 0 };
      fillNcc[t.ncc].trips++;
      if (t.fr_kg != null) { fillNcc[t.ncc].kg_sum += t.fr_kg; fillNcc[t.ncc].kg_count++; }
      if (t.fr_don != null) { fillNcc[t.ncc].don_sum += t.fr_don; fillNcc[t.ncc].don_count++; }
    });
    const by_ncc_fill = Object.keys(fillNcc).map(n => ({
      ncc: n,
      fillrate_kg: fillNcc[n].kg_count > 0 ? fillNcc[n].kg_sum / fillNcc[n].kg_count : 0,
      fillrate_don: fillNcc[n].don_count > 0 ? fillNcc[n].don_sum / fillNcc[n].don_count : 0,
      trips: fillNcc[n].trips
    }));

    // worst routes
    const routesFill = {};
    dailyFillTrips.forEach(t => {
      if (t.route) {
        if (!routesFill[t.route]) routesFill[t.route] = { trips: 0, kg_sum: 0, don_sum: 0, kg_count: 0, don_count: 0, lane: t.lane, ncc: t.ncc };
        routesFill[t.route].trips++;
        if (t.fr_kg != null) { routesFill[t.route].kg_sum += t.fr_kg; routesFill[t.route].kg_count++; }
        if (t.fr_don != null) { routesFill[t.route].don_sum += t.fr_don; routesFill[t.route].don_count++; }
      }
    });
    const worst_routes_fill = Object.keys(routesFill).map(r => ({
      route: r,
      lane_type: routesFill[r].lane,
      ncc: routesFill[r].ncc,
      trips: routesFill[r].trips,
      fillrate_kg: routesFill[r].kg_count > 0 ? routesFill[r].kg_sum / routesFill[r].kg_count : 0,
      fillrate_don: routesFill[r].don_count > 0 ? routesFill[r].don_sum / routesFill[r].don_count : 0
    })).sort((a,b) => a.fillrate_kg - b.fillrate_kg).slice(0, 10);

    // 3. Vehicles Aggregations
    // by_load_capacity
    const capacities = {};
    Object.values(dailyVehicles).forEach(v => {
      const capName = v.cap ? v.cap + ' kg' : 'Khác';
      if (!capacities[capName]) capacities[capName] = { count: 0, cap_raw: v.cap };
      capacities[capName].count++;
    });
    const by_load_capacity = Object.keys(capacities).map(c => ({
      capacity: c,
      capacity_raw: capacities[c].cap_raw,
      count: capacities[c].count,
      percentage: totalVehiclesCount > 0 ? capacities[c].count / totalVehiclesCount : 0
    }));

    // top15_most_used
    const top15_most_used = Object.keys(dailyVehicles).map(plate => ({
      plate,
      trips: dailyVehicles[plate].trips,
      trips_per_day: dailyVehicles[plate].trips / vehicleDaysCount,
      km_per_day: dailyVehicles[plate].total_km / vehicleDaysCount,
      total_km: dailyVehicles[plate].total_km
    })).sort((a,b) => b.trips - a.trips).slice(0, 15);

    // top15_least_used
    const top15_least_used = Object.keys(dailyVehicles).map(plate => ({
      plate,
      trips: dailyVehicles[plate].trips,
      days_active: 1,
      trips_per_day: dailyVehicles[plate].trips / vehicleDaysCount,
      km_per_day: dailyVehicles[plate].total_km / vehicleDaysCount,
      total_km: dailyVehicles[plate].total_km
    })).sort((a,b) => a.trips - b.trips).slice(0, 15);

    // anomalies
    const anomalyPlates = new Set(rawData.vehicles.anomaly_vehicles.map(v => v.plate));
    const anomaly_vehicles = Object.keys(dailyVehicles)
      .filter(plate => anomalyPlates.has(plate))
      .map(plate => {
        const orig = rawData.vehicles.anomaly_vehicles.find(v => v.plate === plate);
        return {
          plate,
          reason: orig ? orig.reason : 'Không rõ',
          trips: dailyVehicles[plate].trips,
          days_active: 1,
          trips_per_day: dailyVehicles[plate].trips / vehicleDaysCount,
          km_per_day: dailyVehicles[plate].total_km / vehicleDaysCount
        };
      });

    return {
      ontime: {
        metadata: { ...rawData.ontime.metadata, total_trips: totalOntimeTrips },
        overall: { ontime_rate: overallOntimeRate, total_trips: totalOntimeTrips },
        daily: rawData.ontime.daily,
        by_lane_type,
        by_partner_type,
        by_partner,
        by_province,
        top10_worst_routes: worst_routes_ontime
      },
      fillrate: {
        metadata: { ...rawData.fillrate.metadata, total_trips: totalFillTrips },
        overall: { fillrate_kg: overallFillKg, fillrate_don: overallFillDon, total_trips: totalFillTrips },
        daily: rawData.fillrate.daily,
        by_lane_type: by_lane_type_fill,
        by_ncc: by_ncc_fill,
        top10_worst_routes: worst_routes_fill
      },
      vehicles: {
        metadata: rawData.vehicles.metadata,
        summary: {
          total_vehicles: totalVehiclesCount,
          avg_trips_per_day: avgTripsInRange,
          avg_km_per_day: avgKmInRange,
          anomaly_count: anomaly_vehicles.length
        },
        daily_usage: rawData.vehicles.daily_usage,
        by_load_capacity,
        top15_most_used,
        top15_least_used,
        anomaly_vehicles
      }
    };
  }

  function highlightTrendChartPoints(startISO, endISO) {
    if (!rawData) return;
    
    const startDay = startISO ? parseInt(startISO.split('-')[2], 10) : 999;
    const endDay = endISO ? parseInt(endISO.split('-')[2], 10) : 999;
    const rangeActive = (filterMode !== 'all');

    function getStyleArrays(dailyList, defaultColor, highlightColor) {
      const radii = [];
      const hoverRadii = [];
      const bgColors = [];
      
      dailyList.forEach(d => {
        const day = parseInt(d.date.split('-')[2], 10);
        const inRange = rangeActive && (day >= startDay && day <= endDay);
        
        if (inRange) {
          radii.push(filterMode === 'single' ? 7 : 5);
          hoverRadii.push(filterMode === 'single' ? 9 : 7);
          bgColors.push(highlightColor);
        } else {
          radii.push(rangeActive ? 1.5 : 3);
          hoverRadii.push(rangeActive ? 4 : 6);
          bgColors.push(rangeActive ? 'rgba(255,255,255,0.08)' : defaultColor);
        }
      });
      return { radii, hoverRadii, bgColors };
    }

    if (charts.ontimeTrend) {
      const styles = getStyleArrays(rawData.ontime.daily, '#f26522', '#ff9f43');
      charts.ontimeTrend.data.datasets[0].pointRadius = styles.radii;
      charts.ontimeTrend.data.datasets[0].pointHoverRadius = styles.hoverRadii;
      charts.ontimeTrend.data.datasets[0].pointBackgroundColor = styles.bgColors;
      charts.ontimeTrend.update('none');
    }

    if (charts.fillrateTrend) {
      const stylesKg = getStyleArrays(rawData.fillrate.daily, '#f26522', '#ff9f43');
      charts.fillrateTrend.data.datasets[0].pointRadius = stylesKg.radii;
      charts.fillrateTrend.data.datasets[0].pointHoverRadius = stylesKg.hoverRadii;
      charts.fillrateTrend.data.datasets[0].pointBackgroundColor = stylesKg.bgColors;
      
      const stylesDon = getStyleArrays(rawData.fillrate.daily, '#005691', '#ff9f43');
      charts.fillrateTrend.data.datasets[1].pointRadius = stylesDon.radii;
      charts.fillrateTrend.data.datasets[1].pointHoverRadius = stylesDon.hoverRadii;
      charts.fillrateTrend.data.datasets[1].pointBackgroundColor = stylesDon.bgColors;
      
      charts.fillrateTrend.update('none');
    }

    if (charts.vehicleTrend) {
      const stylesTrips = getStyleArrays(rawData.vehicles.daily_usage, '#f26522', '#ff9f43');
      charts.vehicleTrend.data.datasets[1].pointRadius = stylesTrips.radii;
      charts.vehicleTrend.data.datasets[1].pointHoverRadius = stylesTrips.hoverRadii;
      charts.vehicleTrend.data.datasets[1].pointBackgroundColor = stylesTrips.bgColors;
      
      const stylesKm = getStyleArrays(rawData.vehicles.daily_usage, '#005691', '#ff9f43');
      charts.vehicleTrend.data.datasets[2].pointRadius = stylesKm.radii;
      charts.vehicleTrend.data.datasets[2].pointHoverRadius = stylesKm.hoverRadii;
      charts.vehicleTrend.data.datasets[2].pointBackgroundColor = stylesKm.bgColors;
      
      charts.vehicleTrend.update('none');
    }
  }

  function handleDateChange() {
    let startISO = '2026-05-01';
    let endISO = '2026-05-25';

    const dateDisplay = $('#dateTextDisplay');
    const datePicker = $('#dateInputPicker');
    const rangeStartInput = $('#rangeStartDate');
    const rangeEndInput = $('#rangeEndDate');
    
    $$('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === filterMode);
    });

    $('#controlsSingleDay').style.display = (filterMode === 'single') ? 'flex' : 'none';
    $('#controlsDateRange').style.display = (filterMode === 'range') ? 'flex' : 'none';
    $('#quickChipsContainer').style.display = (filterMode !== 'all') ? 'flex' : 'none';

    if (filterMode === 'all') {
      if (dateDisplay) dateDisplay.textContent = 'Cả tháng MTD';
    } else if (filterMode === 'single') {
      if (!selectedDate) selectedDate = MAX_DATE;
      startISO = selectedDate;
      endISO = selectedDate;
      if (dateDisplay) dateDisplay.textContent = formatVietnameseDate(selectedDate);
      if (datePicker) datePicker.value = selectedDate;
    } else if (filterMode === 'range') {
      startISO = startDateVal;
      endISO = endDateVal;
      if (rangeStartInput) rangeStartInput.value = startDateVal;
      if (rangeEndInput) rangeEndInput.value = endDateVal;
    }

    destroyAllCharts();

    const activeData = getFilteredDataForDate(startISO, endISO);

    renderKPIs(activeData);

    renderOntimeTab(activeData.ontime);
    renderFillrateTab(activeData.fillrate);
    renderVehiclesTab(activeData.vehicles);

    if (filterMode !== 'all') {
      ontimeFilteredData = ontimeDetailData.filter(r => isShortDateInRange(r.date, startISO, endISO));
      fillFilteredData = fillDetailData.filter(r => isShortDateInRange(r.date, startISO, endISO));
    } else {
      ontimeFilteredData = [...ontimeDetailData];
      fillFilteredData = [...fillDetailData];
    }
    
    ontimeCurrentPage = 1;
    fillCurrentPage = 1;
    
    renderOntimeDetailPage();
    renderFillDetailPage();

    highlightTrendChartPoints(startISO, endISO);
  }

  function handlePrevDate() {
    if (!selectedDate) selectedDate = MAX_DATE;
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    const formatted = formatDateISO(currentDate);
    if (formatted >= MIN_DATE) {
      selectedDate = formatted;
      handleDateChange();
    } else {
      selectedDate = MAX_DATE;
      handleDateChange();
    }
  }

  function handleNextDate() {
    if (!selectedDate) selectedDate = MIN_DATE;
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + 1);
    const formatted = formatDateISO(currentDate);
    if (formatted <= MAX_DATE) {
      selectedDate = formatted;
      handleDateChange();
    } else {
      selectedDate = MIN_DATE;
      handleDateChange();
    }
  }

  function formatDateISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function initDateFilterBar() {
    ['btnModeAll', 'btnModeSingle', 'btnModeRange'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          filterMode = btn.dataset.mode;
          handleDateChange();
        });
      }
    });

    const btnPrev = $('#btnPrevDate');
    const btnNext = $('#btnNextDate');
    const datePicker = $('#dateInputPicker');

    if (btnPrev) btnPrev.addEventListener('click', handlePrevDate);
    if (btnNext) btnNext.addEventListener('click', handleNextDate);
    
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          if (val >= MIN_DATE && val <= MAX_DATE) {
            selectedDate = val;
            handleDateChange();
          } else {
            alert(`Vui lòng chọn ngày từ ${shortDate(MIN_DATE)} đến ${shortDate(MAX_DATE)}/2026`);
            datePicker.value = selectedDate || '';
          }
        }
      });
    }

    const btnApplyRange = $('#btnApplyRange');
    const rangeStartInput = $('#rangeStartDate');
    const rangeEndInput = $('#rangeEndDate');

    if (btnApplyRange) {
      btnApplyRange.addEventListener('click', () => {
        const start = rangeStartInput ? rangeStartInput.value : MIN_DATE;
        const end = rangeEndInput ? rangeEndInput.value : MAX_DATE;

        if (start > end) {
          alert('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
          return;
        }

        if (start < MIN_DATE || end > MAX_DATE) {
          alert(`Vui lòng chọn khoảng thời gian trong phạm vi dữ liệu từ ${shortDate(MIN_DATE)} đến ${shortDate(MAX_DATE)}/2026`);
          return;
        }

        startDateVal = start;
        endDateVal = end;
        handleDateChange();
      });
    }

    const chipYest = $('#chipYesterday');
    if (chipYest) {
      chipYest.addEventListener('click', () => {
        if (filterMode === 'single') {
          selectedDate = MAX_DATE;
        } else if (filterMode === 'range') {
          startDateVal = MAX_DATE;
          endDateVal = MAX_DATE;
        }
        handleDateChange();
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  UPLOAD EXCEL INTEGRATION
  // ═══════════════════════════════════════════════════════

  let pendingOntimeData = null;
  let pendingFillData = null;

  function updateDataSourceBadge(isUploaded, periodLabel) {
    const badge = $('#dataSourceBadge');
    const text = $('#dataSourceText');
    if (!badge || !text) return;
    if (isUploaded) {
      badge.classList.add('uploaded');
      text.textContent = periodLabel || 'Excel upload';
    } else {
      badge.classList.remove('uploaded');
      text.textContent = 'JSON gốc';
    }
  }

  function updateDateRange(minDateStr, maxDateStr) {
    if (!minDateStr || !maxDateStr) return;
    // Update global date constants (they are let-declared now via the module pattern)
    // We can't reassign const, so we write a helper
    window.__dashMinDate = minDateStr;
    window.__dashMaxDate = maxDateStr;
    
    // Update date input min/max attributes
    const datePicker = $('#dateInputPicker');
    const rangeStart = $('#rangeStartDate');
    const rangeEnd = $('#rangeEndDate');
    if (datePicker) { datePicker.min = minDateStr; datePicker.max = maxDateStr; }
    if (rangeStart) { rangeStart.min = minDateStr; rangeStart.max = maxDateStr; }
    if (rangeEnd) { rangeEnd.min = minDateStr; rangeEnd.max = maxDateStr; }
  }

  function getMinDate() { return window.__dashMinDate || MIN_DATE; }
  function getMaxDate() { return window.__dashMaxDate || MAX_DATE; }

  async function refreshArchiveList() {
    const listEl = $('#archiveList');
    if (!listEl) return;

    try {
      const archives = await UploadManager.listArchives();
      const active = await UploadManager.getActiveUpload();
      const activePeriod = active ? active.period : null;

      if (archives.length === 0) {
        listEl.innerHTML = '<div class="archive-empty">Chưa có dữ liệu lưu trữ</div>';
        return;
      }

      listEl.innerHTML = archives.map(arc => {
        const isActive = (arc.period === activePeriod);
        const savedDate = new Date(arc.savedAt).toLocaleDateString('vi-VN');
        const ontimeCount = arc.recordCount?.ontime || 0;
        const fillCount = arc.recordCount?.fillrate || 0;
        return `
          <div class="archive-card ${isActive ? 'active' : ''}" data-period="${arc.period}">
            <div class="archive-period">${arc.period}</div>
            <div class="archive-meta">
              Lưu: ${savedDate}<br>
              Ontime: ${ontimeCount.toLocaleString()} · Fillrate: ${fillCount.toLocaleString()}
            </div>
            <div class="archive-actions">
              <button class="archive-load-btn" data-period="${arc.period}">${isActive ? '✓ Đang dùng' : 'Tải'}</button>
              <button class="archive-delete-btn" data-period="${arc.period}">🗑</button>
            </div>
          </div>
        `;
      }).join('');

      // Event listeners
      listEl.querySelectorAll('.archive-load-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const period = btn.dataset.period;
          await loadArchiveData(period);
        });
      });

      listEl.querySelectorAll('.archive-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const period = btn.dataset.period;
          if (confirm(`Xóa dữ liệu kỳ "${period}"?`)) {
            await UploadManager.deleteArchive(period);
            const active = await UploadManager.getActiveUpload();
            if (active && active.period === period) {
              await UploadManager.clearActiveUpload();
              await reloadWithOriginalData();
            }
            await refreshArchiveList();
          }
        });
      });
    } catch (err) {
      console.error('Error loading archives:', err);
      listEl.innerHTML = '<div class="archive-empty">Lỗi tải danh sách lưu trữ</div>';
    }
  }

  async function loadArchiveData(period) {
    try {
      const archive = await UploadManager.loadArchive(period);
      if (!archive || !archive.data) {
        alert('Không tìm thấy dữ liệu kỳ ' + period);
        return;
      }
      const { data } = archive;
      await UploadManager.setActiveUpload(period);
      applyUploadedData(data, period);
      await refreshArchiveList();

      // Close modal
      $('#uploadModal').classList.remove('active');
    } catch (err) {
      console.error('Error loading archive:', err);
      alert('Lỗi tải dữ liệu: ' + err.message);
    }
  }

  function applyUploadedData(summaryData, periodLabel) {
    // Update rawData
    rawData = {
      ontime: summaryData.ontime,
      fillrate: summaryData.fillrate,
      vehicles: summaryData.vehicles
    };

    // Update detail data
    if (summaryData.ontimeDetail) {
      ontimeDetailData = summaryData.ontimeDetail;
      ontimeFilteredData = [...ontimeDetailData];
    }
    if (summaryData.fillDetail) {
      fillDetailData = summaryData.fillDetail;
      fillFilteredData = [...fillDetailData];
    }

    // Update date range
    if (summaryData.dateRange) {
      updateDateRange(summaryData.dateRange.min, summaryData.dateRange.max);
      startDateVal = summaryData.dateRange.min;
      endDateVal = summaryData.dateRange.max;
    }

    // Update badge
    updateDataSourceBadge(true, periodLabel);

    // Reset to MTD and re-render
    filterMode = 'all';
    selectedDate = null;
    destroyAllCharts();
    handleDateChange();

    initDetailSearch();
  }

  async function reloadWithOriginalData() {
    try {
      await UploadManager.clearActiveUpload();
      const data = await loadAllData();
      rawData = data;

      // Reset date range to defaults
      updateDateRange(MIN_DATE, MAX_DATE);
      startDateVal = MIN_DATE;
      endDateVal = MAX_DATE;

      // Reload detail data
      await loadDetailData();

      updateDataSourceBadge(false);

      filterMode = 'all';
      selectedDate = null;
      destroyAllCharts();
      handleDateChange();
    } catch (err) {
      console.error('Error reloading original data:', err);
      alert('Lỗi tải lại dữ liệu gốc: ' + err.message);
    }
  }

  function resetUploadModal() {
    pendingOntimeData = null;
    pendingFillData = null;
    $('#fileItemOntime').style.display = 'none';
    $('#fileItemFillrate').style.display = 'none';
    $('#uploadFileList').style.display = 'none';
    $('#uploadPreview').style.display = 'none';
    $('#uploadActions').style.display = 'none';
    $('#uploadDropZone').style.display = '';
    $('#uploadFileInput').value = '';
  }

  function updateUploadPreview() {
    const hasOntime = pendingOntimeData && pendingOntimeData.length > 0;
    const hasFill = pendingFillData && pendingFillData.length > 0;

    if (!hasOntime && !hasFill) {
      $('#uploadPreview').style.display = 'none';
      $('#uploadActions').style.display = 'none';
      return;
    }

    let html = '<strong>Tóm tắt dữ liệu:</strong><br>';
    if (hasOntime) {
      const dates = pendingOntimeData.map(r => r.dateISO).filter(Boolean).sort();
      html += `📊 Ontime: <strong>${pendingOntimeData.length.toLocaleString()}</strong> chuyến`;
      if (dates.length > 0) html += ` (${dates[0]} → ${dates[dates.length-1]})`;
      html += '<br>';
    }
    if (hasFill) {
      const dates = pendingFillData.map(r => r.dateISO).filter(Boolean).sort();
      html += `📦 Lấp đầy: <strong>${pendingFillData.length.toLocaleString()}</strong> chuyến`;
      if (dates.length > 0) html += ` (${dates[0]} → ${dates[dates.length-1]})`;
    }

    $('#previewSummary').innerHTML = html;
    $('#uploadPreview').style.display = '';
    $('#uploadActions').style.display = '';
  }

  async function handleFilesSelected(files) {
    for (const file of files) {
      try {
        const wb = await UploadManager.readExcelFile(file);
        const type = UploadManager.detectFileType(wb);

        if (type === 'ontime') {
          pendingOntimeData = UploadManager.parseOntimeExcel(wb);
          $('#fileNameOntime').textContent = file.name;
          $('#fileRowsOntime').textContent = pendingOntimeData.length.toLocaleString() + ' dòng';
          $('#fileItemOntime').style.display = 'flex';
        } else if (type === 'fillrate') {
          pendingFillData = UploadManager.parseFillrateExcel(wb);
          $('#fileNameFillrate').textContent = file.name;
          $('#fileRowsFillrate').textContent = pendingFillData.length.toLocaleString() + ' dòng';
          $('#fileItemFillrate').style.display = 'flex';
        } else {
          alert(`Không nhận diện được loại file "${file.name}".\nFile phải là Ontime hoặc Lấp đầy với đúng cột header.`);
          continue;
        }

        $('#uploadFileList').style.display = '';
        $('#uploadDropZone').style.display = 'none';
        updateUploadPreview();
      } catch (err) {
        alert('Lỗi đọc file "' + file.name + '": ' + err.message);
      }
    }
  }

  function initUploadModal() {
    const modal = $('#uploadModal');
    const btnOpen = $('#btnOpenUpload');
    const btnClose = $('#btnCloseUploadModal');
    const dropZone = $('#uploadDropZone');
    const fileInput = $('#uploadFileInput');
    const btnApply = $('#btnApplyUpload');
    const btnCancel = $('#btnCancelUpload');
    const btnOriginal = $('#btnUseOriginal');

    if (!modal || !btnOpen) return;

    // Open modal
    btnOpen.addEventListener('click', () => {
      resetUploadModal();
      refreshArchiveList();
      modal.classList.add('active');
    });

    // Close modal
    btnClose.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    // Drop zone
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
      );
      if (files.length > 0) handleFilesSelected(files);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) handleFilesSelected(Array.from(fileInput.files));
    });

    // Remove file buttons
    document.querySelectorAll('.file-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type === 'ontime') {
          pendingOntimeData = null;
          $('#fileItemOntime').style.display = 'none';
        } else {
          pendingFillData = null;
          $('#fileItemFillrate').style.display = 'none';
        }
        if (!pendingOntimeData && !pendingFillData) {
          $('#uploadFileList').style.display = 'none';
          $('#uploadDropZone').style.display = '';
        }
        updateUploadPreview();
      });
    });

    // Cancel
    btnCancel.addEventListener('click', () => {
      resetUploadModal();
    });

    // Apply
    btnApply.addEventListener('click', async () => {
      const shouldMerge = $('#chkMergeData').checked;

      let finalOntime = pendingOntimeData || [];
      let finalFill = pendingFillData || [];

      if (shouldMerge) {
        // Merge with current data
        if (pendingOntimeData && ontimeDetailData.length > 0) {
          const result = UploadManager.mergeDetailData(ontimeDetailData, pendingOntimeData);
          finalOntime = result.merged;
        } else if (!pendingOntimeData) {
          finalOntime = [...ontimeDetailData];
        }

        if (pendingFillData && fillDetailData.length > 0) {
          const result = UploadManager.mergeDetailData(fillDetailData, pendingFillData);
          finalFill = result.merged;
        } else if (!pendingFillData) {
          finalFill = [...fillDetailData];
        }
      }

      // Build summary
      const summaryData = UploadManager.buildSummaryData(finalOntime, finalFill);

      // Determine period label
      const periodLabel = summaryData.dateRange.min && summaryData.dateRange.max
        ? summaryData.dateRange.min.substring(0, 7)
        : new Date().toISOString().substring(0, 7);

      // Archive current data first (if from JSON)
      const currentActive = await UploadManager.getActiveUpload();
      if (!currentActive && rawData) {
        const currentPeriod = 'backup-' + MIN_DATE.substring(0, 7);
        await UploadManager.saveArchive(currentPeriod, {
          ontime: rawData.ontime,
          fillrate: rawData.fillrate,
          vehicles: rawData.vehicles,
          ontimeDetail: ontimeDetailData,
          fillDetail: fillDetailData,
          dateRange: { min: MIN_DATE, max: MAX_DATE }
        });
      }

      // Save new data
      await UploadManager.saveArchive(periodLabel, summaryData);
      await UploadManager.setActiveUpload(periodLabel);

      // Apply
      applyUploadedData(summaryData, periodLabel);

      // Close modal
      modal.classList.remove('active');
      resetUploadModal();
    });

    // Use original data
    if (btnOriginal) {
      btnOriginal.addEventListener('click', async () => {
        await reloadWithOriginalData();
        await refreshArchiveList();
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════

  async function init() {
    setupChartDefaults();
    initTabs();
    initRefreshButton();
    initUploadModal();

    try {
      // Check for previously uploaded data in IndexedDB
      let activeUpload = null;
      try {
        activeUpload = await UploadManager.getActiveUpload();
      } catch (e) { /* IndexedDB not available */ }

      if (activeUpload && activeUpload.period) {
        // Try to load from archive
        try {
          const archive = await UploadManager.loadArchive(activeUpload.period);
          if (archive && archive.data) {
            // Load original data as fallback base
            const baseData = await loadAllData();
            rawData = baseData;

            // Hide loading, show dashboard
            $('#loadingOverlay').classList.add('hidden');
            $('#dashboardContainer').style.display = '';

            await loadDetailData();
            initDateFilterBar();

            // Apply archived upload data
            applyUploadedData(archive.data, activeUpload.period);
            return;
          }
        } catch (e) {
          console.warn('Failed to load archived upload:', e);
          await UploadManager.clearActiveUpload();
        }
      }

      // Default: load from JSON files
      const data = await loadAllData();
      rawData = data;

      // Hide loading, show dashboard
      $('#loadingOverlay').classList.add('hidden');
      $('#dashboardContainer').style.display = '';

      // Load detailed tables data
      await loadDetailData();

      // Initialize the Date Filter Bar listeners
      initDateFilterBar();

      // Start with "Cả tháng" (MTD) view
      handleDateChange();

    } catch (err) {
      console.error('Dashboard init error:', err);
      $('#loadingOverlay').classList.add('hidden');
      $('#dashboardContainer').style.display = '';
      $('#errorState').classList.add('visible');
      // Hide tab content
      $$('.tab-panel').forEach((p) => p.style.display = 'none');
      $('.tab-nav').style.display = 'none';
      $('.kpi-grid').style.display = 'none';
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
