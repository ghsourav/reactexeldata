import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';
import GoogleAuthWrapper from './GoogleAuthWrapper';
import reportWebVitals from './reportWebVitals';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

ReactDOM.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleAuthWrapper>
        <App />
      </GoogleAuthWrapper>
    </GoogleOAuthProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

reportWebVitals();
