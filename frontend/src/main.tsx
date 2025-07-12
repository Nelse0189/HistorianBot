import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyASulNsXt9XKMAoU_fLROYy26eHI7axX0E",
//   authDomain: "discordbot-e1d3d.firebaseapp.com",
//   projectId: "discordbot-e1d3d",
//   storageBucket: "discordbot-e1d3d.appspot.com",
//   messagingSenderId: "527084465069",
//   appId: "1:527084465069:web:e9eac26c533a6a83b94f24",
//   measurementId: "G-BJHEB4YCXP"
// };

// Initialize Firebase
// const app = initializeApp(firebaseConfig);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
