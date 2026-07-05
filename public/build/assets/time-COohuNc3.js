import{c as s}from"./createLucideIcon-DzaXU_Oy.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",key:"143wyd"}],["path",{d:"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",key:"1itne7"}],["rect",{x:"6",y:"14",width:"12",height:"8",rx:"1",key:"1ue0tg"}]],u=s("Printer",h);function d(e){const t=Math.max(0,Math.round(Number(e)||0));return`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`}function f(e){const t=Math.max(0,Math.round(Number(e)||0)),n=Math.floor(t/60),a=t%60;return[n>0?`${n} jam`:"",a>0?`${a} menit`:""].filter(Boolean).join(" ")||"0 menit"}function p(e,t){const[n,a]=e.split(":").map(Number),[o,m]=t.split(":").map(Number);if([n,a,o,m].some(i=>Number.isNaN(i)))return 0;let r=o*60+m-(n*60+a);return r<=0&&(r+=24*60),r}export{u as P,f as a,d as h,p as m};
