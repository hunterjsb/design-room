import {Sun,Moon,Wind,Radio,Flag,Mountain,Compass,Wrench,Sprout,Zap,Droplet,Shield,Rocket,Star,Target,Milestone} from 'lucide-react';
import type {IconName} from '../lib/icons';
const icons={sun:Sun,moon:Moon,wind:Wind,radio:Radio,flag:Flag,mountain:Mountain,compass:Compass,wrench:Wrench,sprout:Sprout,zap:Zap,droplet:Droplet,shield:Shield,rocket:Rocket,star:Star,target:Target,milestone:Milestone};
export function BoardIcon({name,size=20}:{name?:IconName,size?:number}){const Icon=icons[name||'star'];return <Icon size={size} strokeWidth={1.6}/>;}
