import{c}from"./createLucideIcon-DJ-dUi08.js";import{j as t,$ as n}from"./app-dLkeyxY6.js";import{c as o}from"./utils-BRMhMjhB.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i=[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["path",{d:"m21 21-4.3-4.3",key:"1qie3q"}]],l=c("Search",i);function u({links:r}){return r.length<=3?null:t.jsx("div",{className:"flex flex-wrap items-center gap-1",children:r.map((e,a)=>t.jsx(n,{href:e.url??"#",preserveScroll:!0,className:o("inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm",e.active?"border-primary bg-primary text-primary-foreground":"bg-background hover:bg-accent",!e.url&&"pointer-events-none opacity-50"),dangerouslySetInnerHTML:{__html:e.label}},a))})}export{u as P,l as S};
