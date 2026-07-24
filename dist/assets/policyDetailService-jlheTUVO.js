import{d as r,s as i}from"./index-BxyB_tXg.js";async function n(e){return(await r(`policyDetail:byId:${e}`,async()=>{const{data:t,error:a}=await i.from("policies").select(`
          *,
          customer:customer_id(id, name, phone, national_id),
          owner:owner_id(id, name)
        `).eq("id",e).single();if(a)throw a;return t},{emptyValue:{}})).data}async function s(e){return(await r(`policyDetail:deletable:${e}`,async()=>{const{data:t,error:a}=await i.rpc("can_delete_policy",{p_policy_id:e});if(a)throw a;return!!t},{emptyValue:!1})).data}export{s as c,n as f};
