/* StructCalc – JS utilitários globais */

// ─── Toast notification ───────────────────────────────────────
window.showToast = function(msg, tipo = 'success') {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    document.body.appendChild(toast);
  }
  const colors = {
    success: 'bg-green-800 border border-green-600 text-green-100',
    danger:  'bg-red-900  border border-red-700   text-red-100',
    info:    'bg-blue-900 border border-blue-700   text-blue-100',
    warning: 'bg-yellow-900 border border-yellow-700 text-yellow-100',
  };
  toast.className = `${colors[tipo] || colors.info} rounded-xl px-4 py-3 shadow-2xl text-sm font-medium flex items-center gap-2`;
  toast.innerHTML = `<i class="fa-solid fa-circle-check shrink-0"></i><span>${msg}</span>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity  = '0';
    toast.style.transform = 'translateY(8px)';
  }, 4000);
};

// ─── Auto-scroll para o painel de resultados (mobile) ─────────
window.scrollToResultados = function() {
  if (window.innerWidth >= 1024) return; // desktop: side-by-side, sem scroll
  const el = document.getElementById('resultados-panel');
  if (el) {
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
};

// ─── Formatadores ─────────────────────────────────────────────
window.fmt = function(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toString();
    return parseFloat(v.toFixed(3)).toString();
  }
  return v.toString();
};

window.fmtKey = function(k) {
  const mapa = {
    h_cm:'h (cm)', d_cm:'d útil (cm)', bw_cm:'bw (cm)',
    PP_kNm2:'PP (kN/m²)', g_total_kNm2:'g total (kN/m²)', q_d_kNm2:'q_d (kN/m²)',
    Mx_kNm:'Mx (kN.m)', My_kNm:'My (kN.m)', Mx_ef_kNm:'Mx ef. (kN.m)', My_ef_kNm:'My ef. (kN.m)',
    As_x_cm2m:'As-x (cm²/m)', As_y_ou_dist_cm2m:'As-y/dist (cm²/m)',
    h_total_cm:'h total (cm)', h_nervura_cm:'h nervura (cm)', h_capa_cm:'h capa (cm)',
    b_nervura_cm:'bw nervura (cm)', espacamento_cm:'Espaç. (cm)',
    Md_nerv_kNm:'Md/nervura (kN.m)', As_nervura_cm2:'As/nervura (cm²)', As_capa_cm2m:'As capa (cm²/m)',
    tau_d_MPa:'τ_Sd (MPa)', tau_Rd_MPa:'τ_Rd (MPa)', cortante_ok:'Cortante OK',
    l_m:'L (m)', As_lon_cm2:'As long. (cm²)', Md_kNm:'Md (kN.m)', Vd_kN:'Vd (kN)',
    b_cm:'b (cm)', le_m:'le (m)', lambda_x:'λx', lambda_y:'λy', lambda_max:'λmax',
    As_total_cm2:'As total (cm²)', As_min_cm2:'As mín. (cm²)', As_max_cm2:'As máx. (cm²)',
    N_rd_kN:'N_Rd (kN)', capacidade_ok:'Capacidade', phi_estribo_mm:'φ estribo (mm)', s_estribo_cm:'s estribo (cm)',
    sigma_adm_kNm2:'σ_adm (kN/m²)', sigma_real_kNm2:'σ real (kN/m²)', lado_m:'Lado (m)',
    h_sap_cm:'h sapata (cm)', d_sap_cm:'d sapata (cm)', Md_kNm_m:'Md (kN.m/m)', As_cm2_m:'As (cm²/m)',
    punc_ok:'Puncionamento', tensao_ok:'Tensão solo',
    b_corrida_cm:'b corrida (cm)', bw_viga_cm:'bw viga (cm)', h_viga_cm:'h viga (cm)',
    Rp_kN:'Rp (kN)', Rl_kN:'Rl (kN)', Qtotal_kN:'Q_ult (kN)', Qadm_kN:'Q_adm (kN)', n_estacas:'Nº estacas',
    H_m:'H (m)', Ka:'Ka', Ea_kNm:'Ea (kN/m)', y_ea_m:'ȳ (m)',
    t_tela_cm:'Espessura tela (cm)', l_sapata_m:'L sapata (m)', h_sapata_cm:'h sapata (cm)',
    FS_tombamento:'FS tombamento', FS_deslizamento:'FS deslizamento',
    sigma_max_kNm2:'σmax (kN/m²)', sigma_min_kNm2:'σmin (kN/m²)', As_tela_cm2m:'As tela (cm²/m)',
    tombamento_ok:'Tombamento', deslizamento_ok:'Deslizamento',
    fbk_MPa:'fbk (MPa)', fd_MPa:'fd (MPa)', lambda:'λ', phi:'φ',
    N_Rd_kNm:'N_Rd (kN/m)', aprovado:'Aprovado', As_h_min_cm2m:'As horiz. (cm²/m)',
    rho_min:'ρ mín.', fck:'fck (MPa)', aco:'Aço', cobrimento_mm:'Cobrimento (mm)',
    PP_kNm:'PP (kN/m)', g_total_kNm:'g total (kN/m)', q_d_kNm:'q_d (kN/m)',
  };
  return mapa[k] || k.replace(/_/g, ' ');
};

window.CAMPOS_OCULTOS = new Set([
  'passos','bitola_principal','bitola_secundaria','bitola_longitudinal',
  'bitola_nervura','bitola_capa','bitola_tela','bitola','estribos',
  'tipo','subtipo','aco','cobrimento_mm','classe_esbeltez','aviso_esbeltez',
  'recomendacao','observacao','disponivel','calculo_id',
]);

window.CAMPOS_BOOL_OK = new Set([
  'cortante_ok','capacidade_ok','punc_ok','tensao_ok','tombamento_ok',
  'deslizamento_ok','aprovado','sigma_adm_ok',
]);

// Registra service worker para PWA (se suportado)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Apenas registra se houver um sw.js (opcional)
  });
}
