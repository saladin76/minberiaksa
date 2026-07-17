'use client';

import { useMemo, useState } from 'react';

const amounts = [25, 50, 100, 250];
const frequencies = ['مرة واحدة', 'يومي', 'كل جمعة', 'شهري'];
const donationTypes = ['حيث الحاجة أشد', 'غزة', 'القدس', 'زكاة', 'وقف'];

const projects = [
  {
    tag: 'القدس · وقف',
    title: 'وقف القدس المستدام',
    body: 'ساهم في مشروع وقفي يدعم أهل القدس ومؤسساتها الإنسانية على المدى الطويل.',
    cta: 'استكشف مشروع الوقف',
 