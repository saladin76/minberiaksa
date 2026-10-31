import sharp from 'sharp';
import {writeFile}from'node:fs/promises';
// Reuse and center the original transparent mark without redrawing its artwork.
async function icon(size){const inset=Math.round(size*.07);return sharp('public/minbar/assets/logo-mark.png').trim().resize(size-inset*2,size-inset*2,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top:inset,bottom:inset,left:inset,right:inset,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();}
const full=await icon(512);await writeFile('app/icon.png',full);await writeFile('public/brand/minber-site-icon.png',full);await writeFile('app/apple-icon.png',await icon(180));
const png=await icon(256),head=Buffer.alloc(22);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(png.length,14);head.writeUInt32LE(22,18);await writeFile('app/favicon.ico',Buffer.concat([head,png]));
console.log('Transparent institutional icons generated with safe inset.');
