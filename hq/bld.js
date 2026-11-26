/* 1126 오피니 매장 건물 그림 (아이소 SVG) — H.bld({w,h,S,oy,v:'box'|'corner'|'twin'|'lounge',c,mat,props}) */
(function(H){
H.bld = function(o){
  const W=o.w,H=o.h,S=o.S||11.5,OX=W/2,OY=o.oy||H*0.5;
  let P=(x,y,z)=>[OX+(x-y)*0.866*S, OY+(x+y)*0.5*S - z*S];
  const pt=a=>a.map(p=>P(...p).map(v=>v.toFixed(1)).join(',')).join(' ');
  const face=(a,f,ex='')=>`<polygon points="${pt(a)}" fill="${f}" ${ex}/>`;
  const line=(a,c,w=1,ex='')=>`<polyline points="${pt(a)}" stroke="${c}" stroke-width="${w}" fill="none" ${ex}/>`;
  const man=(x,y,z,c)=>{const [a,b]=P(x,y,z);return `<ellipse cx="${a}" cy="${b}" rx="3.4" ry="1.4" fill="#0004"/><rect x="${a-2.5}" y="${b-9.5}" width="5" height="8.8" rx="2.5" fill="${c}"/><circle cx="${a}" cy="${b-12}" r="2.4" fill="#FFD9B8"/>`;};
  const pot=(x,y,z)=>{const [a,b]=P(x,y,z);return `<rect x="${a-4}" y="${b-6}" width="8" height="6" rx="1.5" fill="#C9874E"/><circle cx="${a}" cy="${b-11}" r="6.5" fill="#3E8E5A"/><circle cx="${a-2}" cy="${b-14}" r="4" fill="#58B076"/>`;};
  const parasol=(x,y,c)=>{const [a,b]=P(x,y,0);return `<ellipse cx="${a}" cy="${b-5}" rx="6" ry="2.8" fill="#F4F0E8"/><line x1="${a}" y1="${b}" x2="${a}" y2="${b-22}" stroke="#EEE" stroke-width="1.4"/><path d="M${a-13} ${b-20} Q${a} ${b-33} ${a+13} ${b-20}z" fill="${c}"/>`;};
  const bench=(x,y)=>face([[x,y,0.4],[x+1.4,y,0.4],[x+1.4,y+0.4,0.4],[x,y+0.4,0.4]],'#8E5E33')+face([[x,y+0.4,0],[x+1.4,y+0.4,0],[x+1.4,y+0.4,0.4],[x,y+0.4,0.4]],'#6E4625');
  const MAT={wood:['#B07A45','#8E5E33'],white:['#F2EEE7','#D4CEC3'],brick:['#B85A3E','#9A4430']};
  const box=(x0,y0,z0,x1,y1,z1,c,mat)=>{let r='';
    r+=face([[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],'url(#rmL)')+face([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],'#FFE7B8')+face([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],'#E9DAC0');
    for(let j=0;j<Math.round((x1-x0+y1-y0)/3);j++) r+=man(x0+0.5+((j*1.7)%Math.max(.4,x1-x0-0.8)),y0+0.5+((j*1.3)%Math.max(.4,y1-y0-0.8)),z0,'#3A2A2A80');
    if(mat&&mat!=='glass'){const [l,rr]=MAT[mat];
      // solid wall with big window band
      const h=z1-z0,wb=z0+h*0.18,wt=z0+h*0.82;
      r+=face([[x0,y1,z0],[x1,y1,z0],[x1,y1,wb],[x0,y1,wb]],l)+face([[x0,y1,wt],[x1,y1,wt],[x1,y1,z1],[x0,y1,z1]],l);
      r+=face([[x1,y0,z0],[x1,y1,z0],[x1,y1,wb],[x1,y0,wb]],rr)+face([[x1,y0,wt],[x1,y1,wt],[x1,y1,z1],[x1,y0,z1]],rr);
      r+=face([[x0,y1,wb],[x1,y1,wb],[x1,y1,wt],[x0,y1,wt]],'url(#bw1)')+face([[x1,y0,wb],[x1,y1,wb],[x1,y1,wt],[x1,y0,wt]],'url(#bw2)');
      for(let x=x0;x<=x1+0.01;x+=(x1-x0)/4) r+=line([[x,y1,wb],[x,y1,wt]],l,2.4);
      for(let y=y0;y<=y1+0.01;y+=(y1-y0)/3) r+=line([[x1,y,wb],[x1,y,wt]],rr,2.4);
      if(mat==='brick'){for(let z=z0+0.25;z<z1;z+=0.25){if(z>wb&&z<wt)continue;r+=line([[x0,y1,z],[x1,y1,z],[x1,y0,z]],'#00000018',0.8);}}
      if(mat==='wood'){for(let x=x0+0.3;x<x1;x+=0.3){r+=line([[x,y1,z0],[x,y1,wb]],'#00000020',0.7)+line([[x,y1,wt],[x,y1,z1]],'#00000020',0.7);}}
    } else {
      r+=face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],'url(#bw1)')+face([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],'url(#bw2)');
      for(let x=x0+0.6;x<x1;x+=0.6) r+=line([[x,y1,z0],[x,y1,z1]],'#ffffff26');
      for(let y=y0+0.6;y<y1;y+=0.6) r+=line([[x1,y,z0],[x1,y,z1]],'#ffffff38');
      r+=line([[x1,y1,z0],[x1,y1,z1]],'#fff',1.6,'opacity=".85"');
    }
    r+=line([[x0,y1,z0+0.05],[x1,y1,z0+0.05],[x1,y0,z0+0.05]],c,2.2)+line([[x0,y1,z0+0.05],[x1,y1,z0+0.05],[x1,y0,z0+0.05]],c,7,'opacity=".3" filter="url(#gl)"');
    const t=0.14;r+=face([[x0,y1,z1],[x1,y1,z1],[x1,y1,z1+t],[x0,y1,z1+t]],'#F4F0E8')+face([[x1,y0,z1],[x1,y1,z1],[x1,y1,z1+t],[x1,y0,z1+t]],'#DCD6CB')+face([[x0,y0,z1+t],[x1,y0,z1+t],[x1,y1,z1+t],[x0,y1,z1+t]],'#E7E2D8');
    return r;};
  const sign=(x0,x1,y,z,c)=>{const xm=(x0+x1)/2,w=Math.min(1.5,(x1-x0)*0.35);let r=face([[xm-w,y+0.02,z],[xm+w,y+0.02,z],[xm+w,y+0.02,z+0.85],[xm-w,y+0.02,z+0.85]],'#1B2240');const [a,b]=P(xm,y+0.03,z+0.42);r+=`<circle cx="${a}" cy="${b}" r="${S*0.3}" fill="${c}"/><circle cx="${a}" cy="${b}" r="${S*0.13}" fill="#fff"/>`;return r;};
  const awn=(x0,x1,y,z,c)=>{let r='';const n=Math.max(3,Math.round((x1-x0)/0.55));for(let i=0;i<n;i++){const a=x0+i*(x1-x0)/n,b=x0+(i+1)*(x1-x0)/n;r+=face([[a,y,z],[b,y,z],[b,y+0.8,z-0.45],[a,y+0.8,z-0.45]],i%2?'#fff':c);}return r;};
  const c=o.c||'#2FBF9F';
  let s=`<defs><linearGradient id="rmL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEBC8"/><stop offset="1" stop-color="#F2B474"/></linearGradient><linearGradient id="bw1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A5BA8" stop-opacity=".28"/><stop offset=".45" stop-color="#1B2A5C" stop-opacity=".16"/><stop offset=".5" stop-color="#B7CBF5" stop-opacity=".45"/><stop offset=".56" stop-color="#1B2A5C" stop-opacity=".16"/><stop offset="1" stop-color="#0E1638" stop-opacity=".28"/></linearGradient><linearGradient id="bw2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22336B" stop-opacity=".3"/><stop offset="1" stop-color="#0B1230" stop-opacity=".42"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
  s+=face([[-1.6,-1.6,0],[10.6,-1.6,0],[10.6,10.6,0],[-1.6,10.6,0]],'#BFC8B4')+face([[-1,-1,0],[10,-1,0],[10,10,0],[-1,10,0]],'#D8DECD');
  s+=face([[-1,6.2,0.01],[10,6.2,0.01],[10,8.2,0.01],[-1,8.2,0.01]],'#ECE4D2');
  const m=o.mat||'glass';
  if(o.v==='box'){ s+=box(-0.4,0.2,0,8.6,6,3,c,m)+sign(1,7,6.02,3.15,c)+awn(0.6,4,6.05,2.7,c); }
  if(o.v==='corner'){ s+=box(-0.4,0.2,0,3.6,6,3.2,c,m)+box(3.6,0.2,0,8.6,3.4,2.6,c,m)+sign(-0.2,3.4,6.02,3.35,c);
     s+=face([[3.8,3.6,0.03],[8.6,3.6,0.03],[8.6,6,0.03],[3.8,6,0.03]],'#E2D6BC'); s+=parasol(5.4,4.8,c)+parasol(7.6,5,c); }
  if(o.v==='lounge'){ s+=box(-0.4,0.2,0,8.6,6,2.8,c,m)+sign(0.6,5,6.02,2.95,c)+box(-0.4,0.2,3.0,5.6,6,5.6,c,m)+sign(0.4,4.8,6.02,5.75,c);
     for(let y=1;y<5.6;y+=1.5) s+=pot(8.1,y,2.94); s+=man(7,3.6,2.94,'#FFD76B')+man(7.4,1.8,2.94,'#fff'); }
  if(o.v==='twin'){ s+=box(-0.4,0.2,0,3.4,6,3.2,c,m)+box(5,0.2,0,8.8,6,2.8,c,m);
     s+=face([[3.4,1.8,1.6],[5,1.8,1.6],[5,4.2,1.6],[3.4,4.2,1.6]],'#E7E2D8')+face([[3.4,4.2,1.6],[5,4.2,1.6],[5,4.2,2.6],[3.4,4.2,2.6]],'url(#bw1)')+face([[3.4,1.8,2.6],[5,1.8,2.6],[5,4.2,2.6],[3.4,4.2,2.6]],'#F4F0E8');
     s+=sign(5.4,8.4,6.02,2.95,c); }
  if(o.props){ if(o.props.includes('pot')) for(const [x,y] of [[0,6.6],[2.6,6.6],[8.9,1.4],[8.9,3.6]]) s+=pot(x,y,0);
    if(o.props.includes('para')) for(const [x,y] of [[5,7.4],[7.4,7.4]]) s+=parasol(x,y,c);
    if(o.props.includes('bench')) s+=bench(3.4,7.6); }
  s+=man(4.2,7.6,0,'#FFD76B')+man(6.4,7.9,0,'#fff');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

})(window.HQ);
