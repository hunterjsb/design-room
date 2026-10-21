import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {assetURL} from '../src/client';
export function SecureImage({src,...props}:ImgHTMLAttributes<HTMLImageElement>){const [url,setURL]=useState(''),[failed,setFailed]=useState(false);useEffect(()=>{let active=true;setURL('');setFailed(false);if(src)assetURL(src).then(value=>{if(active)setURL(value)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[src]);return url?<img src={url} {...props}/>:<span className="asset-placeholder">{failed?'Image unavailable':'Loading image…'}</span>}
