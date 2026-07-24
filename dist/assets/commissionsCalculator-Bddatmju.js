import{d as D,s as p}from"./index-BxyB_tXg.js";import{t as _,Y as f,ar as O}from"./vendor-utils-CiRmQHyF.js";const h={monthly:12,quarterly:4,semi_annual:2,annual:1},S={year1Payments:[],year2Payments:[]};async function P(t,o){const e=_(f(O(o,1)),"yyyy-MM-dd"),a=_(f(o),"yyyy-MM-dd");return(await D(`commissions:source:${t}:${e}:${a}`,async()=>{const[r,u]=await Promise.all([p.from("payments").select(`
            id, amount, paid_at,
            installment:installment_id(
              policy:policy_id(
                id, policy_number, payment_method, sum_assured, owner_id,
                customer:customer_id(name)
              )
            )
          `).eq("is_cancelled",!1).gte("payment_month",e).lte("payment_month",a),p.from("year2_payments").select(`
            id, amount, payment_date,
            policy:policy_id(
              id, policy_number, payment_method, sum_assured, owner_id,
              customer:customer_id(name)
            )
          `).eq("is_cancelled",!1).gte("payment_month",e).lte("payment_month",a)]);if(r.error)throw r.error;if(u.error)throw u.error;const l=(r.data||[]).filter(n=>{var s,i;return((i=(s=n.installment)==null?void 0:s.policy)==null?void 0:i.owner_id)===t}),m=(u.data||[]).filter(n=>{var s;return((s=n.policy)==null?void 0:s.owner_id)===t});return{year1Payments:l,year2Payments:m}},{emptyValue:S})).data}const C=.024,R=4/1e3;function M(t){if(t.getDate()<=15)return{dueDay:20,dueMonth:_(t,"yyyy-MM")};const e=new Date(t.getFullYear(),t.getMonth()+1,1);return{dueDay:5,dueMonth:_(e,"yyyy-MM")}}function E(t){return t.length<=6?t:t.slice(-6)}function g(t){const[o,e,a]=t.split("-").map(Number);return new Date(o,e-1,a)}function b(t,o,e){var r,u,l;const a=[];let y=0;for(const m of t){const n=(r=m.installment)==null?void 0:r.policy;if(!n)continue;const s=h[n.payment_method];if(!s)continue;const{dueDay:i,dueMonth:c}=M(new Date(m.paid_at));if(c!==e)continue;if(!n.sum_assured){y+=1;continue}const d=Number(n.sum_assured)*C/s;a.push({id:`y1-${m.id}`,customerName:((u=n.customer)==null?void 0:u.name)||"-",policyLast6:E(n.policy_number),type:"year1",amount:d,dueDay:i,dueMonth:c})}for(const m of o){const n=m.policy;if(!n)continue;const s=g(m.payment_date),{dueDay:i,dueMonth:c}=M(s);if(c!==e)continue;const d=h[n.payment_method];if(!d)continue;if(!n.sum_assured){y+=1;continue}const w=Number(n.sum_assured)*R/d;a.push({id:`y2-${m.id}`,customerName:((l=n.customer)==null?void 0:l.name)||"-",policyLast6:E(n.policy_number),type:"renewal",amount:w,dueDay:i,dueMonth:c})}return{rows:a,missingSumAssuredCount:y}}function T(t){const o={totalMonth:0,dueOn5:0,dueOn20:0};for(const e of t)o.totalMonth+=e.amount,e.dueDay===5?o.dueOn5+=e.amount:o.dueOn20+=e.amount;return o}const L=t=>new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",minimumFractionDigits:0}).format(t),Y={year1:"السنة الأولى",renewal:"تجديد"};export{Y as C,T as a,L as b,b as c,P as f};
