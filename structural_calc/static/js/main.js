/* StructCalc – JS utilitários globais */

// Toast notification
window.showToast = function(msg, tipo = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  const colors = {
    success: 'bg-green-800 border-green-600 text-green-100',
    danger:  'bg-red-900  border-red-700   text-red-100',
    info:    'bg-blue-900 border-blue-700   text-blue-100',
    warning: 'bg-yellow-900 border-yellow-700 text-yellow-100',
  };
  toast.className = `${colors[tipo] || colors.info} border rounded-xl px-5 py-3 shadow-xl text-sm font-medium`;
  toast.innerHTML = `<i class="fa-solid fa-circle-check mr-2"></i>${msg}`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3500);
};

// Formata número com 2 casas ou como inteiro
window.fmt = function(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toString() : v.toFixed(3).replace(/\.?0+$/, '');
  }
  return v.toString();
};

// Formata chave de campo para rótulo legível
window.fmtKey = function(k) {
  const mapa = {
    h_cm: 'h (cm)', d_cm: 'd (cm)', bw_cm: 'bw (cm)',
    PP_kNm2: 'PP (kN/m²)', g_total_kNm2: 'g total (kN/m²)',
    q_d_kNm2: 'q_d (kN/m²)', Mx_kNm: 'Mx (kN.m)', My_kNm: 'My (kN.m)',
    As_x_cm2m: 'As-x (cm²/m)', As_y_ou_dist_cm2m: 'As-y/dist (cm²/m)',
    h_total_cm: 'h total (cm)', h_nervura_cm: 'h nervura (cm)',
    h_capa_cm: 'h capa (cm)', b_nervura_cm: 'bw nervura (cm)',
    espacamento_cm: 'Espaç. (cm)', Md_nerv_kNm: 'Md/nervura (kN.m)',
    As_nervura_cm2: 'As/nervura (cm²)', As_capa_cm2m: 'As capa (cm²/m)',
    tau_d_MPa: 'τ_Sd (MPa)', tau_Rd_MPa: 'τ_Rd (MPa)', cortante_ok: 'Cortante',
    l_m: 'L (m)', As_lon_cm2: 'As long. (cm²)',
    Md_kNm: 'Md (kN.m)', Vd_kN: 'Vd (kN)',
    b_cm: 'b (cm)', le_m: 'le (m)',
    lambda_x: 'λx', lambda_y: 'λy', lambda_max: 'λmax',
    Mx_ef_kNm: 'Mx ef. (kN.m)', My_ef_kNm: 'My ef. (kN.m)',
    As_total_cm2: 'As total (cm²)', As_min_cm2: 'As mín. (cm²)',
    As_max_cm2: 'As máx. (cm²)', N_rd_kN: 'N_Rd (kN)',
    capacidade_ok: 'Capacidade', phi_estribo_mm: 'φ estribo (mm)',
    s_estribo_cm: 's estribo (cm)',
    sigma_adm_kNm2: 'σ_adm (kN/m²)', sigma_real_kNm2: 'σ_real (kN/m²)',
    lado_m: 'Lado (m)', h_sap_cm: 'h sapata (cm)', d_sap_cm: 'd sapata (cm)',
    Md_kNm_m: 'Md (kN.m/m)', As_cm2_m: 'As (cm²/m)',
    punc_ok: 'Puncionamento', tensao_ok: 'Tensão solo',
    b_corrida_cm: 'b corrida (cm)', bw_viga_cm: 'bw viga (cm)',
    h_viga_cm: 'h viga (cm)', As_lon_cm2: 'As long. (cm²)',
    Rp_kN: 'Rp (kN)', Rl_kN: 'Rl (kN)',
    Qtotal_kN: 'Q_ult (kN)', Qadm_kN: 'Q_adm (kN)', n_estacas: 'Nº estacas',
    H_m: 'H (m)', Ka: 'Ka', Ea_kNm: 'Ea (kN/m)', y_ea_m: 'ȳ (m)',
    t_tela_cm: 'Espess. tela (cm)', l_sapata_m: 'L sapata (m)',
    h_sapata_cm: 'h sapata (cm)', FS_tombamento: 'FS tombamento',
    FS_deslizamento: 'FS deslizamento', sigma_max_kNm2: 'σmax solo (kN/m²)',
    sigma_min_kNm2: 'σmin solo (kN/m²)', As_tela_cm2m: 'As tela (cm²/m)',
    tombamento_ok: 'Tombamento', deslizamento_ok: 'Deslizamento',
    fbk_MPa: 'fbk (MPa)', fd_MPa: 'fd (MPa)', lambda: 'λ', phi: 'φ',
    N_Rd_kNm: 'N_Rd (kN/m)', aprovado: 'Aprovado',
    As_h_min_cm2m: 'As horiz. mín. (cm²/m)',
    rho_min: 'ρ mín.', fck: 'fck (MPa)', aco: 'Aço', cobrimento_mm: 'Cobrimento (mm)',
  };
  return mapa[k] || k.replace(/_/g, ' ');
};

// Campos a omitir no painel de resultados
window.CAMPOS_OCULTOS = new Set([
  'passos','bitola_principal','bitola_secundaria','bitola_longitudinal',
  'bitola_nervura','bitola_capa','bitola_tela','bitola','estribos',
  'tipo','subtipo','aco','cobrimento_mm','classe_esbeltez','aviso_esbeltez',
  'recomendacao','observacao','disponivel','calculo_id',
]);

// Campos booleanos de verificação
window.CAMPOS_BOOL_OK = new Set([
  'cortante_ok','capacidade_ok','punc_ok','tensao_ok','tombamento_ok',
  'deslizamento_ok','aprovado','sigma_adm_ok',
]);

// Renderiza valor com badge se booleano
window.renderVal = function(k, v) {
  if (CAMPOS_BOOL_OK.has(k)) {
    return v
      ? '<span class="badge-success">OK</span>'
      : '<span class="badge-danger">Verificar</span>';
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return fmt(v);
};

// Inicializa collapse simples para Alpine sem plugin
document.addEventListener('alpine:init', () => {
  Alpine.directive('collapse', (el) => {
    el.style.overflow = 'hidden';
    el.style.transition = 'height 0.25s ease';
  });
});
