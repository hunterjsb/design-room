import {createRoot} from 'react-dom/client';
import {AuthGate} from './auth';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<AuthGate><App/></AuthGate>);
