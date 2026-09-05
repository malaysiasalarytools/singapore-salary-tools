(function(global){
  const SG2026 = {};
  SG2026.OW_CEILING = 8000;
  SG2026.ANNUAL_WAGE_CEILING = 102000;
  SG2026.RELIEF_CAP = 80000;
  SG2026.cpfRates = {
    "55below": { employee: 0.20, employer: 0.17 },
    "55to60": { employee: 0.18, employer: 0.16 },
    "60to65": { employee: 0.125, employer: 0.125 },
    "65to70": { employee: 0.075, employer: 0.09 },
    "70above": { employee: 0.05, employer: 0.075 }
  };
  SG2026.getCpfRates = age => SG2026.cpfRates[age] || SG2026.cpfRates["55below"];
  // 2026 Table 1 phased-in coefficients for Singapore Citizens / SPRs from 3rd year onwards.
  // For wages >S$500 to S$750: total = baseTotal × TW + employeeSlope × (TW-S$500); employee = employeeSlope × (TW-S$500).
  SG2026.lowWageCpf = {
    "55below": {baseTotal:.17, employeeSlope:.60},
    "55to60": {baseTotal:.16, employeeSlope:.54},
    "60to65": {baseTotal:.125, employeeSlope:.375},
    "65to70": {baseTotal:.09, employeeSlope:.225},
    "70above": {baseTotal:.075, employeeSlope:.15}
  };
  SG2026.roundCpf = (totalRaw, employeeRaw) => {
    const total = Math.round(Math.max(0,totalRaw));
    const employee = Math.floor(Math.max(0,employeeRaw));
    return { total, employee, employer: Math.max(0,total-employee) };
  };
  // Computes CPF for one contribution month. aw is Additional Wage paid in that same month.
  SG2026.monthlyCpf = (monthlyOw, age="55below", eligible=true, aw=0) => {
    if(!eligible) return {total:0,employee:0,employer:0,owSubject:0,awSubject:0};
    const ow=Math.max(0,Math.min(Number(monthlyOw)||0,SG2026.OW_CEILING));
    const awSubject=Math.max(0,Number(aw)||0), tw=ow+awSubject;
    const r=SG2026.getCpfRates(age), low=SG2026.lowWageCpf[age]||SG2026.lowWageCpf["55below"];
    let totalRaw=0, employeeRaw=0;
    if(tw<=50){} 
    else if(tw<=500){ totalRaw=low.baseTotal*tw; }
    else if(tw<=750){ employeeRaw=low.employeeSlope*(tw-500); totalRaw=low.baseTotal*tw+employeeRaw; }
    else { employeeRaw=tw*r.employee; totalRaw=tw*(r.employee+r.employer); }
    return {...SG2026.roundCpf(totalRaw,employeeRaw),owSubject:ow,awSubject};
  };
  SG2026.annualCpf = (monthlySalary, bonus=0, age="55below", eligible=true) => {
    const salary=Math.max(0,Number(monthlySalary)||0), aw=Math.max(0,Number(bonus)||0);
    if(!eligible) return {monthly:{total:0,employee:0,employer:0,owSubject:0,awSubject:0}, annualEmployee:0, annualEmployer:0, annualTotal:0, awCeiling:0, bonusSubject:0, bonusEmployee:0, bonusEmployer:0, bonusTotal:0};
    const monthly=SG2026.monthlyCpf(salary,age,true,0);
    const annualOw=monthly.owSubject*12;
    const awCeiling=Math.max(0,SG2026.ANNUAL_WAGE_CEILING-annualOw);
    const bonusSubject=Math.min(aw,awCeiling);
    // Assume the entered annual bonus/AW is paid in one month. Apply CPF rounding once to that month's OW+AW,
    // then compare it with an ordinary OW-only month to isolate the incremental CPF attributable to the AW.
    const combined=SG2026.monthlyCpf(salary,age,true,bonusSubject);
    const bonusEmployee=Math.max(0,combined.employee-monthly.employee);
    const bonusEmployer=Math.max(0,combined.employer-monthly.employer);
    const bonusTotal=bonusEmployee+bonusEmployer;
    const annualEmployee=monthly.employee*11+combined.employee;
    const annualEmployer=monthly.employer*11+combined.employer;
    return {monthly,annualEmployee,annualEmployer,annualTotal:annualEmployee+annualEmployer,awCeiling,bonusSubject,bonusEmployee,bonusEmployer,bonusTotal};
  };
  SG2026.residentTax = income => {
    const bands=[[20000,0],[10000,.02],[10000,.035],[40000,.07],[40000,.115],[40000,.15],[40000,.18],[40000,.19],[40000,.195],[40000,.20],[180000,.22],[500000,.23],[Infinity,.24]];
    let rem=Math.max(0,Number(income)||0), tax=0;
    for(const [limit,rate] of bands){ const t=Math.min(rem,limit); tax+=t*rate; rem-=t; if(rem<=0) break; }
    return tax;
  };
  SG2026.taxEstimate = (totalIncome, employeeCpf=0, otherReliefs=0, residency="resident") => {
    const income=Math.max(0,Number(totalIncome)||0);
    if(residency==="nonresident"){
      const progressive=SG2026.residentTax(income);
      return {tax:Math.max(progressive,income*.15),chargeableIncome:income,reliefsApplied:0};
    }
    const reliefsApplied=Math.min(SG2026.RELIEF_CAP,Math.max(0,Number(employeeCpf)||0)+Math.max(0,Number(otherReliefs)||0));
    const chargeableIncome=Math.max(0,income-reliefsApplied);
    return {tax:SG2026.residentTax(chargeableIncome),chargeableIncome,reliefsApplied};
  };
  SG2026.scheduleDays = {
    "mon-fri":[1,2,3,4,5], "mon-sat":[1,2,3,4,5,6], "tue-sat":[2,3,4,5,6]
  };
  SG2026.countScheduledDays = (start,end,schedule="mon-fri") => {
    const allowed=SG2026.scheduleDays[schedule]||SG2026.scheduleDays["mon-fri"]; let c=0, d=new Date(start);
    while(d<=end){ if(allowed.includes(d.getDay())) c++; d.setDate(d.getDate()+1); }
    return c;
  };
  SG2026.incompleteMonthPay=(monthlyGross,totalWorkingDays,daysWorked)=> totalWorkingDays>0 ? Math.max(0,Number(monthlyGross)||0)/totalWorkingDays*Math.max(0,Number(daysWorked)||0):0;
  SG2026.grossDailyRate=(monthlyGross,avgDaysPerWeek)=> (52*(Number(avgDaysPerWeek)||0))>0 ? 12*Math.max(0,Number(monthlyGross)||0)/(52*Number(avgDaysPerWeek)):0;
  global.SG2026=SG2026;
})(window);