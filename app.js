/* ============================================================
   DAI TU TRANSPORTATION DASHBOARD — Application Logic
   ============================================================ */

(function () {
  'use strict';

  // ─── Chart Color Palette ─────────────────────────────────
  const CHART_COLORS = [
    '#00e5a0', '#7c5cfc', '#f87171', '#fbbf24', '#60a5fa',
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
  let selectedDate = null; // null means "Cả tháng" (MTD), otherwise "YYYY-MM-DD"
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
    return '#00e5a0';
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
    return '#00e5a0';
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

    Chart.defaults.color = 'rgba(240,240,245,0.5)';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.04)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 7;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(7,9,15,0.94)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.08)';
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

    // Date range subtitle
    const dateRange = ontime.metadata.date_range || fillrate.metadata.date_range || '';
    $('#dateRangeSubtitle').textContent = 'Dữ liệu MTD: ' + dateRange;

    // Last updated
    const lastUpdated = ontime.metadata.generated_at || fillrate.metadata.generated_at || '';
    if ($('#lastUpdatedTime')) {
      $('#lastUpdatedTime').textContent = 'Cập nhật: ' + formatTimestamp(lastUpdated);
    }
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
          borderColor: '#00e5a0',
          backgroundColor: createGradientFill('#chartOntimeTrend', '#00e5a0'),
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#00e5a0',
          pointBorderColor: '#07090f',
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
          borderColor: '#07090f',
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
          borderColor: '#07090f',
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
            color: '#e8e8e8',
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
            color: '#e8e8e8',
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
            borderColor: '#00e5a0',
            backgroundColor: 'rgba(0,229,160,0.06)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#00e5a0',
            borderWidth: 2.5
          },
          {
            label: 'Lấp đầy Đơn',
            data: donVals,
            borderColor: '#7c5cfc',
            backgroundColor: 'rgba(124,92,252,0.06)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#7c5cfc',
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
            backgroundColor: '#00e5a0',
            borderRadius: 6
          },
          {
            label: 'Lấp đầy Đơn',
            data: byLane.map((d) => +(d.fillrate_don * 100).toFixed(1)),
            backgroundColor: '#7c5cfc',
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
            color: '#e8e8e8',
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
            color: '#e8e8e8',
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
            borderColor: '#00e5a0',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#00e5a0',
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
            borderColor: '#fbbf24',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#fbbf24',
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
            title: { display: true, text: 'Chuyến/xe', color: '#00e5a0' },
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#00e5a0' }
          },
          yKm: {
            position: 'right',
            title: { display: true, text: 'Km', color: '#fbbf24' },
            grid: { display: false },
            ticks: { color: '#fbbf24' }
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
          borderColor: '#07090f',
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
            color: '#e8e8e8',
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
        ctx.fillStyle = '#e8e8e8';
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

  function getFilteredDataForDate(dateStr) {
    if (!dateStr) return rawData;
    
    const shortDateStr = shortDate(dateStr); // e.g. "25/05"
    
    // Filter ontime detail
    const dailyOntimeTrips = ontimeDetailData.filter(r => r.date === shortDateStr);
    const dailyFillTrips = fillDetailData.filter(r => r.date === shortDateStr);
    
    // Calculate daily overall KPIs
    const ontimeDailyEntry = rawData.ontime.daily.find(d => d.date === dateStr) || { ontime_rate: 0, trips: 0 };
    const fillDailyEntry = rawData.fillrate.daily.find(d => d.date === dateStr) || { fillrate_kg: 0, fillrate_don: 0, trips: 0 };
    const vehicleDailyEntry = rawData.vehicles.daily_usage.find(d => d.date === dateStr) || { active_vehicles: 0, total_trips: 0, avg_trips_per_vehicle: 0, avg_km: 0 };

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

    // worst routes (Group by route, filter trips >= 2 if possible, or >= 1 since it's a single day)
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
    // Group by plate to find top vehicles for this day
    const dailyVehicles = {};
    dailyFillTrips.forEach(t => {
      if (t.plate) {
        if (!dailyVehicles[t.plate]) dailyVehicles[t.plate] = { trips: 0, total_km: 0, cap: t.cap };
        dailyVehicles[t.plate].trips++;
        dailyVehicles[t.plate].total_km += t.km;
      }
    });
    
    // by_load_capacity
    const capacities = {};
    Object.values(dailyVehicles).forEach(v => {
      const capName = v.cap ? v.cap + ' kg' : 'Khác';
      if (!capacities[capName]) capacities[capName] = { count: 0, cap_raw: v.cap };
      capacities[capName].count++;
    });
    const totalVehiclesCount = Object.keys(dailyVehicles).length;
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
      trips_per_day: dailyVehicles[plate].trips,
      km_per_day: dailyVehicles[plate].total_km,
      total_km: dailyVehicles[plate].total_km
    })).sort((a,b) => b.trips - a.trips).slice(0, 15);

    // top15_least_used
    const top15_least_used = Object.keys(dailyVehicles).map(plate => ({
      plate,
      trips: dailyVehicles[plate].trips,
      days_active: 1,
      trips_per_day: dailyVehicles[plate].trips,
      km_per_day: dailyVehicles[plate].total_km,
      total_km: dailyVehicles[plate].total_km
    })).sort((a,b) => a.trips - b.trips).slice(0, 15);

    // Filter anomalies for this specific day
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
          trips_per_day: dailyVehicles[plate].trips,
          km_per_day: dailyVehicles[plate].total_km
        };
      });

    return {
      ontime: {
        metadata: { ...rawData.ontime.metadata, total_trips: ontimeDailyEntry.trips },
        overall: { ontime_rate: ontimeDailyEntry.ontime_rate, total_trips: ontimeDailyEntry.trips },
        daily: rawData.ontime.daily, // Keep trend lines intact
        by_lane_type,
        by_partner_type,
        by_partner,
        by_province,
        top10_worst_routes: worst_routes_ontime
      },
      fillrate: {
        metadata: { ...rawData.fillrate.metadata, total_trips: fillDailyEntry.trips },
        overall: { fillrate_kg: fillDailyEntry.fillrate_kg, fillrate_don: fillDailyEntry.fillrate_don, total_trips: fillDailyEntry.trips },
        daily: rawData.fillrate.daily, // Keep trend lines intact
        by_lane_type: by_lane_type_fill,
        by_ncc: by_ncc_fill,
        top10_worst_routes: worst_routes_fill
      },
      vehicles: {
        metadata: rawData.vehicles.metadata,
        summary: {
          total_vehicles: totalVehiclesCount,
          avg_trips_per_day: vehicleDailyEntry.avg_trips_per_vehicle,
          avg_km_per_day: vehicleDailyEntry.avg_km,
          anomaly_count: anomaly_vehicles.length
        },
        daily_usage: rawData.vehicles.daily_usage, // Keep trend lines intact
        by_load_capacity,
        top15_most_used,
        top15_least_used,
        anomaly_vehicles
      }
    };
  }

  function highlightTrendChartPoints(dateStr) {
    const shortD = dateStr ? shortDate(dateStr) : null;

    // Highlight Ontime Trend Chart
    if (charts.ontimeTrend && rawData) {
      const daily = rawData.ontime.daily;
      const radii = daily.map(d => (shortDate(d.date) === shortD) ? 7 : 3);
      const hoverRadii = daily.map(d => (shortDate(d.date) === shortD) ? 9 : 6);
      const bgColors = daily.map(d => (shortDate(d.date) === shortD) ? '#ff9f43' : '#00e5a0');
      
      charts.ontimeTrend.data.datasets[0].pointRadius = radii;
      charts.ontimeTrend.data.datasets[0].pointHoverRadius = hoverRadii;
      charts.ontimeTrend.data.datasets[0].pointBackgroundColor = bgColors;
      charts.ontimeTrend.update('none');
    }

    // Highlight Fillrate Trend Chart
    if (charts.fillrateTrend && rawData) {
      const daily = rawData.fillrate.daily;
      charts.fillrateTrend.data.datasets[0].pointRadius = daily.map(d => (shortDate(d.date) === shortD) ? 7 : 3);
      charts.fillrateTrend.data.datasets[0].pointHoverRadius = daily.map(d => (shortDate(d.date) === shortD) ? 9 : 6);
      charts.fillrateTrend.data.datasets[0].pointBackgroundColor = daily.map(d => (shortDate(d.date) === shortD) ? '#ff9f43' : '#00e5a0');
      
      charts.fillrateTrend.data.datasets[1].pointRadius = daily.map(d => (shortDate(d.date) === shortD) ? 7 : 3);
      charts.fillrateTrend.data.datasets[1].pointHoverRadius = daily.map(d => (shortDate(d.date) === shortD) ? 9 : 6);
      charts.fillrateTrend.data.datasets[1].pointBackgroundColor = daily.map(d => (shortDate(d.date) === shortD) ? '#ff9f43' : '#7c5cfc');
      
      charts.fillrateTrend.update('none');
    }

    // Highlight Vehicle Trend Chart
    if (charts.vehicleTrend && rawData) {
      const daily = rawData.vehicles.daily_usage;
      charts.vehicleTrend.data.datasets[1].pointRadius = daily.map(d => (shortDate(d.date) === shortD) ? 7 : 3);
      charts.vehicleTrend.data.datasets[1].pointHoverRadius = daily.map(d => (shortDate(d.date) === shortD) ? 9 : 6);
      charts.vehicleTrend.data.datasets[1].pointBackgroundColor = daily.map(d => (shortDate(d.date) === shortD) ? '#ff9f43' : '#00e5a0');
      
      charts.vehicleTrend.data.datasets[2].pointRadius = daily.map(d => (shortDate(d.date) === shortD) ? 7 : 3);
      charts.vehicleTrend.data.datasets[2].pointHoverRadius = daily.map(d => (shortDate(d.date) === shortD) ? 9 : 6);
      charts.vehicleTrend.data.datasets[2].pointBackgroundColor = daily.map(d => (shortDate(d.date) === shortD) ? '#ff9f43' : '#fbbf24');
      
      charts.vehicleTrend.update('none');
    }
  }

  function handleDateChange(newDate) {
    selectedDate = newDate;

    // 1. Update Date Filter UI
    const btnPrev = $('#btnPrevDate');
    const btnNext = $('#btnNextDate');
    const datePicker = $('#dateInputPicker');
    const dateDisplay = $('#dateTextDisplay');
    const chipAll = $('#chipAllMonth');
    const chipYest = $('#chipYesterday');

    if (chipAll) chipAll.classList.remove('active');
    if (chipYest) chipYest.classList.remove('active');

    if (!selectedDate) {
      if (chipAll) chipAll.classList.add('active');
      if (dateDisplay) dateDisplay.textContent = 'Cả tháng MTD';
      if (datePicker) datePicker.value = '';
    } else {
      if (selectedDate === MAX_DATE) {
        if (chipYest) chipYest.classList.add('active');
      }
      if (dateDisplay) dateDisplay.textContent = formatVietnameseDate(selectedDate);
      if (datePicker) datePicker.value = selectedDate;
    }

    // 2. Destroy existing charts to prevent Canvas reuse warnings
    destroyAllCharts();

    // 3. Get the correct data set (filtered or raw)
    const activeData = getFilteredDataForDate(selectedDate);

    // 4. Render KPIs with dynamic counting animations
    renderKPIs(activeData);

    // 5. Render Chart Tabs
    renderOntimeTab(activeData.ontime);
    renderFillrateTab(activeData.fillrate);
    renderVehiclesTab(activeData.vehicles);

    // 6. Trigger filter on the detailed tables so they show only this day's trips
    if (selectedDate) {
      const shortDateStr = shortDate(selectedDate);
      ontimeFilteredData = ontimeDetailData.filter(r => r.date === shortDateStr);
      fillFilteredData = fillDetailData.filter(r => r.date === shortDateStr);
    } else {
      ontimeFilteredData = [...ontimeDetailData];
      fillFilteredData = [...fillDetailData];
    }
    
    // Reset pagination
    ontimeCurrentPage = 1;
    fillCurrentPage = 1;
    
    // Render pages
    renderOntimeDetailPage();
    renderFillDetailPage();

    // Highlight the selected day on the trend line charts
    highlightTrendChartPoints(selectedDate);
  }

  function handlePrevDate() {
    if (!selectedDate) {
      handleDateChange(MAX_DATE);
      return;
    }
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    const formatted = formatDateISO(currentDate);
    if (formatted >= MIN_DATE) {
      handleDateChange(formatted);
    } else {
      handleDateChange(MAX_DATE); // Wrap to max
    }
  }

  function handleNextDate() {
    if (!selectedDate) {
      handleDateChange(MIN_DATE);
      return;
    }
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + 1);
    const formatted = formatDateISO(currentDate);
    if (formatted <= MAX_DATE) {
      handleDateChange(formatted);
    } else {
      handleDateChange(MIN_DATE); // Wrap to min
    }
  }

  function formatDateISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function initDateFilterBar() {
    const btnPrev = $('#btnPrevDate');
    const btnNext = $('#btnNextDate');
    const datePicker = $('#dateInputPicker');
    const chipAll = $('#chipAllMonth');
    const chipYest = $('#chipYesterday');

    if (btnPrev) btnPrev.addEventListener('click', handlePrevDate);
    if (btnNext) btnNext.addEventListener('click', handleNextDate);
    
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          if (val >= MIN_DATE && val <= MAX_DATE) {
            handleDateChange(val);
          } else {
            alert(`Vui lòng chọn ngày từ ${shortDate(MIN_DATE)} đến ${shortDate(MAX_DATE)}/2026`);
            datePicker.value = selectedDate || '';
          }
        } else {
          handleDateChange(null);
        }
      });
    }

    if (chipAll) chipAll.addEventListener('click', () => handleDateChange(null));
    if (chipYest) chipYest.addEventListener('click', () => handleDateChange(MAX_DATE));
  }

  async function init() {
    setupChartDefaults();
    initTabs();
    initRefreshButton();

    try {
      const data = await loadAllData();
      rawData = data;

      // Hide loading, show dashboard
      $('#loadingOverlay').classList.add('hidden');
      $('#dashboardContainer').style.display = '';

      // Load detailed tables data first so we have the raw trip details for daily filtering!
      await loadDetailData();

      // Initialize the Date Filter Bar listeners
      initDateFilterBar();

      // Start with "Cả tháng" (MTD) view
      handleDateChange(null);

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
