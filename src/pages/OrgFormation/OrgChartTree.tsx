import { forwardRef } from 'react';
import type { OrgChartNode } from './orgChartBuilder';

export type ChartDensity = 'xl' | 'lg' | 'md' | 'sm' | 'xs';

// إعدادات كل مستوى "كثافة" (تتقلّص تدريجيًا كلما زاد عدد الأفراد، حفاظًا على صفحة واحدة)
const DENSITY_SETTINGS: Record<ChartDensity, {
  boxW: number; boxPad: string; gap: number;
  nameHead: number; roleHead: number;
  nameSup: number; roleSup: number;
  nameGl: number; roleGl: number;
  nameAgent: number;
  agentColW: number;
}> = {
  xl: { boxW: 168, boxPad: '10px 14px', gap: 34, nameHead: 17, roleHead: 12.5, nameSup: 14.5, roleSup: 11, nameGl: 13, roleGl: 10, nameAgent: 12, agentColW: 132 },
  lg: { boxW: 156, boxPad: '9px 12px',  gap: 28, nameHead: 16, roleHead: 12,   nameSup: 13.5, roleSup: 10.5, nameGl: 12.5, roleGl: 9.5, nameAgent: 11.5, agentColW: 124 },
  md: { boxW: 144, boxPad: '8px 11px',  gap: 22, nameHead: 15, roleHead: 11.5, nameSup: 13,   roleSup: 10,   nameGl: 12,   roleGl: 9,   nameAgent: 11,   agentColW: 116 },
  sm: { boxW: 132, boxPad: '7px 9px',   gap: 16, nameHead: 14, roleHead: 11,   nameSup: 12,   roleSup: 9.5,  nameGl: 11,   roleGl: 8.5, nameAgent: 10,   agentColW: 106 },
  xs: { boxW: 118, boxPad: '6px 8px',   gap: 11, nameHead: 13, roleHead: 10,   nameSup: 11,   roleSup: 9,    nameGl: 10,   roleGl: 8,   nameAgent: 9,     agentColW: 96  },
};

interface OrgChartTreeProps {
  heads: OrgChartNode[];
  branchName: string;
  asOfDateLabel: string;
  companyName: string;
  companyLogoUrl: string | null;
  density: ChartDensity;
  widthPx: number;
}

function renderNode(node: OrgChartNode): JSX.Element {
  if (node.tier === 2) {
    // رئيس مجموعة: يُعرض كصندوق، وتحته قائمة أسماء الوكلاء فقط (بدون لقب "وكيل")
    return (
      <li key={node.id}>
        <div className="org-box org-box-gl">
          <p className="org-name">{node.name}</p>
          <p className="org-role">{node.roleLabel}</p>
        </div>
        {node.children.length > 0 && (
          <ul>
            <li className="org-agents-leaf">
              <div className="org-agents-box">
                {node.children.map((a) => (
                  <div key={a.id} className="org-agent-name">{a.name}</div>
                ))}
              </div>
            </li>
          </ul>
        )}
      </li>
    );
  }

  const tierClass = node.tier === 0 ? 'org-box-head' : node.tier === 1 ? 'org-box-sup' : 'org-box-gl';
  // نعكس ترتيب الأبناء بصريًا (والهيكل نفسه يُفرض عليه اتجاه LTR أدناه) عشان يُقرأ
  // التشكيل من اليمين لليسار كما هو متوقع في واجهة عربية، مع بقاء حسابات خطوط
  // الربط الكلاسيكية (first-child / last-child) صحيحة هندسيًا كما صُمّمت أصلاً لـ LTR.
  const children = node.children.length > 0 ? [...node.children].reverse() : node.children;
  return (
    <li key={node.id}>
      <div className={`org-box ${tierClass}`}>
        <p className="org-name">{node.name}</p>
        <p className="org-role">{node.roleLabel}</p>
      </div>
      {children.length > 0 && (
        <ul>{children.map(renderNode)}</ul>
      )}
    </li>
  );
}

export const OrgChartTree = forwardRef<HTMLDivElement, OrgChartTreeProps>(function OrgChartTree(
  { heads, branchName, asOfDateLabel, companyName, companyLogoUrl, density, widthPx },
  ref,
) {
  const d = DENSITY_SETTINGS[density];

  return (
    <div
      ref={ref}
      dir="rtl"
      className="org-formation-report"
      style={{ width: widthPx, background: '#ffffff', padding: '22px 26px', boxSizing: 'border-box' }}
    >
      <style>{`
        .org-formation-report { font-family: 'Cairo', 'IBM Plex Sans Arabic', Tahoma, sans-serif; color: #1e293b; }
        .org-formation-report .ofr-brand { display:flex; align-items:center; justify-content:center; margin-bottom:6px; }
        .org-formation-report .ofr-brand img { width: 26px; height: 26px; object-fit: contain; margin: 0 4px; }
        .org-formation-report .ofr-brand span { font-size: 12.5px; font-weight: 700; color: #475569; }
        .org-formation-report .ofr-title { text-align:center; font-size: 22px; font-weight: 800; color:#0f172a; margin-bottom: 6px; }
        .org-formation-report .ofr-meta { display:flex; justify-content:center; gap: 28px; font-size: 12.5px; color:#334155; border-bottom: 2px solid #16a34a; padding-bottom: 10px; margin-bottom: 6px; }
        .org-formation-report .ofr-meta b { color:#0f172a; font-weight: 700; }

        .org-formation-report .org-tree, .org-formation-report .org-tree ul, .org-formation-report .org-tree li {
          list-style:none; margin:0; padding:0; position:relative;
        }
        /* الشجرة نفسها (خطوط الربط وترتيب الأعمدة) لازم تُبنى بـ LTR دايمًا، لأن تقنية
           خطوط الربط الكلاسيكية (first-child/last-child) مبنية على افتراض LTR، وتحت
           dir=rtl بيتقلب ترتيب flex ويكسر الخطوط. رتبنا الأبناء بالعكس أعلاه (reverse)
           عشان التشكيل يُقرأ بصريًا من اليمين لليسار رغم اتجاه LTR الداخلي. */
        .org-formation-report .org-tree { direction: ltr; }
        .org-formation-report .org-box, .org-formation-report .org-agents-box { direction: rtl; }
        .org-formation-report .org-tree { display:flex; justify-content:center; padding-top: 6px; }
        .org-formation-report .org-tree > ul { display:flex; }
        .org-formation-report .org-tree ul { display:flex; padding-top: ${d.gap}px; }
        .org-formation-report .org-tree li {
          display:flex; flex-direction:column; align-items:center; position:relative;
          padding: ${d.gap}px ${Math.round(d.gap / 3)}px 0;
        }
        .org-formation-report .org-tree li::before,
        .org-formation-report .org-tree li::after {
          content:''; position:absolute; top:0; right:50%; border-top: 2px solid #94a3b8; width:50%; height:${d.gap}px;
        }
        .org-formation-report .org-tree li::after { right:auto; left:50%; border-left: 2px solid #94a3b8; }
        .org-formation-report .org-tree li:only-child::after,
        .org-formation-report .org-tree li:only-child::before { display:none; }
        .org-formation-report .org-tree li:only-child { padding-top:0; }
        .org-formation-report .org-tree li:first-child::before,
        .org-formation-report .org-tree li:last-child::after { border:0 none; }
        .org-formation-report .org-tree li:last-child::before { border-right: 2px solid #94a3b8; }
        .org-formation-report .org-tree li:first-child::after { }
        .org-formation-report .org-tree ul ul::before {
          content:''; position:absolute; top:0; left:50%; border-left: 2px solid #94a3b8; width:0; height:${d.gap}px;
        }
        /* أول مستوى (رأس التشكيل) بلا خطوط أفقية علوية */
        .org-formation-report .org-tree > ul > li::before,
        .org-formation-report .org-tree > ul > li::after { display:none; }
        .org-formation-report .org-tree > ul > li { padding-top:0; }

        .org-formation-report .org-box {
          width: ${d.boxW}px; padding: ${d.boxPad}; border-radius: 10px; box-shadow: 0 1px 3px rgba(15,23,42,.12);
          border: 1px solid rgba(15,23,42,.06);
        }
        .org-formation-report .org-name { font-weight: 800; line-height: 1.25; word-break: break-word; }
        .org-formation-report .org-role { line-height: 1.2; opacity: .85; margin-top: 2px; font-weight: 600; }

        .org-formation-report .org-box-head { background:#0f172a; color:#fff; }
        .org-formation-report .org-box-head .org-name { font-size: ${d.nameHead}px; }
        .org-formation-report .org-box-head .org-role { font-size: ${d.roleHead}px; color:#cbd5e1; }

        .org-formation-report .org-box-sup { background:#16a34a; color:#fff; }
        .org-formation-report .org-box-sup .org-name { font-size: ${d.nameSup}px; }
        .org-formation-report .org-box-sup .org-role { font-size: ${d.roleSup}px; color:#dcfce7; }

        .org-formation-report .org-box-gl { background:#eff6ff; color:#1e3a8a; border-color:#bfdbfe; }
        .org-formation-report .org-box-gl .org-name { font-size: ${d.nameGl}px; }
        .org-formation-report .org-box-gl .org-role { font-size: ${d.roleGl}px; color:#3b82f6; }

        .org-formation-report .org-tree li.org-agents-leaf { padding-top: ${Math.round(d.gap * 0.7)}px; }
        .org-formation-report .org-agents-box {
          width: ${d.agentColW}px; background:#f8fafc; border:1px solid #e2e8f0; border-radius: 8px;
          padding: 6px 8px; display:flex; flex-direction:column;
        }
        .org-formation-report .org-agent-name {
          font-size: ${d.nameAgent}px; font-weight: 600; color:#334155; text-align:center;
          line-height: 1.3; border-bottom: 1px dashed #e2e8f0; padding-bottom: 3px; margin-bottom: 3px;
        }
        .org-formation-report .org-agent-name:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      `}</style>

      <div className="ofr-brand">
        {companyLogoUrl && <img src={companyLogoUrl} alt={companyName} />}
        <span>{companyName}</span>
      </div>
      <div className="ofr-title">تشكيل الجهاز الإنتاجي</div>
      <div className="ofr-meta">
        <span><b>الفرع:</b> {branchName || '—'}</span>
        <span><b>اعتبارًا من:</b> {asOfDateLabel || '—'}</span>
      </div>

      <div className="org-tree">
        <ul>{(heads.length > 0 ? [...heads].reverse() : heads).map(renderNode)}</ul>
      </div>
    </div>
  );
});
