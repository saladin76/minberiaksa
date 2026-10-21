/** Scope guest document access to certificate buttons, never to body {{donation.id}}. */
export function certificateParameterSlots(schema:unknown,scopedNames:Record<string,string>,trustedOrigin:string):string[]{
  if(!Array.isArray(schema))return[];
  const result:string[]=[];
  for(const component of schema){
    if(String(component?.type).toUpperCase()!=="BUTTONS"||!Array.isArray(component.buttons))continue;
    component.buttons.forEach((button:{type?:unknown;url?:unknown},index:number)=>{
      const key=`button.${index}.1`;
      let trusted=false;try{trusted=new URL(String(button.url)).origin===new URL(trustedOrigin).origin;}catch{/* Invalid URLs do not receive a donor token. */}
      if(trusted && String(button.type).toUpperCase()==="URL" && scopedNames[key]==="donation.id" && /^https:\/\/[^/]+\/api\/(?:certificates\/(?:thanks|waqf)|receipts)\/\{\{1\}\}$/i.test(String(button.url || "")))result.push(key);
    });
  }
  return result;
}
export function certificateParameterOverrides(slots:string[],donationId:string,token:string|null|undefined):Record<string,string>{
  if(!token)return{};
  return Object.fromEntries(slots.map(key=>[key,`${donationId}?t=${encodeURIComponent(token)}`]));
}
