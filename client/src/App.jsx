import { Routes, Route, Navigate } from 'react-router-dom';
import { FileProvider } from './context/FileContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PreviewProvider } from './context/PreviewContext.jsx';
import { InlineSuggestionProvider } from './context/InlineSuggestionContext.jsx';
import Layout from './components/Layout/Layout.jsx';
import LandingPage from './components/LandingPage/LandingPage.jsx';
import Documentation from './components/Documentation/Documentation.jsx';
import Examples from './components/Examples/Examples.jsx';
import './index.css';

// Higher Order Component to protect the workspace
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) return null; // Or a loading spinner
  
  // If not logged in, redirect to landing page
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}

function EditorWorkspace() {
  return (
    <FileProvider>
      <ChatProvider>
        <PreviewProvider>
          <InlineSuggestionProvider>
            <Layout />
          </InlineSuggestionProvider>
        </PreviewProvider>
      </ChatProvider>
    </FileProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/examples" element={<Examples />} />
        <Route 
          path="/editor" 
          element={
            <ProtectedRoute>
              <EditorWorkspace />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </AuthProvider>
  );
}
