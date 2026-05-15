import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { VscCode, VscWand, VscRocket, VscDeviceMobile } from 'react-icons/vsc';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthModal from '../Auth/AuthModal.jsx';
import ThemeToggle from '../common/ThemeToggle.jsx';
import './LandingPage.css';

const features = [
  {
    icon: <VscWand />,
    title: 'AI-Powered Generation',
    description: 'Describe your app idea in natural language and watch as production-ready MERN stack code is generated instantly.',
  },
  {
    icon: <VscCode />,
    title: 'Monaco Editor Integration',
    description: 'Experience a world-class editing environment powered by the exact same engine that runs Visual Studio Code.',
  },
  {
    icon: <VscDeviceMobile />,
    title: 'Live Preview',
    description: 'See your changes instantly with integrated live preview that updates in real-time as your code evolves.',
  },
  {
    icon: <VscRocket />,
    title: 'Instant Deployment Prep',
    description: 'Your codebase is completely modular, structured perfectly, and ready to be deployed at a moment\'s notice.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleEditorLaunch = () => {
    if (user) {
      navigate('/editor');
    } else {
      setIsAuthModalOpen(true);
    }
  };

  return (
    <div className="landing-container">
      {/* Background Orbs */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      {/* Navigation */}
      <nav className="landing-nav">
        <motion.div 
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="logo-icon">C</div>
          <span>Codex</span>
        </motion.div>
        
        <motion.div 
          className="nav-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ThemeToggle />
          <button className="btn btn-secondary" onClick={() => navigate('/docs')}>
            Documentation
          </button>
          <button className="btn btn-primary" onClick={handleEditorLaunch}>
            {user ? 'Open Workspace' : 'Sign In'}
          </button>
        </motion.div>
      </nav>

      {/* Hero Section */}
      <main className="hero-section">
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="badge">✨ Powered by Groq AI</div>
          <h1 className="hero-title">
            Build Full-Stack Apps<br />
            <span className="text-gradient">At the Speed of Thought</span>
          </h1>
          <p className="hero-subtitle">
            Experience the future of development. Vibecode combines advanced AI with a fully-featured cloud IDE, enabling you to go from natural language prompts to a working MERN application in seconds.
          </p>
          
          <div className="hero-cta">
            <button className="btn btn-primary btn-large" onClick={handleEditorLaunch}>
              Get Started for Free
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => navigate('/examples')}>
              View Examples
            </button>
          </div>
        </motion.div>

        {/* Browser Mockup */}
        <motion.div 
          className="browser-mockup"
          initial={{ opacity: 0, scale: 0.95, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="browser-header">
            <div className="dots">
              <span></span><span></span><span></span>
            </div>
            <div className="url-bar">codex.dev/workspace</div>
          </div>
          <div className="browser-body">
            <div className="mockup-sidebar"></div>
            <div className="mockup-editor">
              <div className="code-line"><span>import</span> &#123; useState &#125; <span>from</span> 'react';</div>
              <div className="code-line"></div>
              <div className="code-line"><span>export default function</span> App() &#123;</div>
              <div className="code-line indent"><span>const</span> [vibe, setVibe] = useState('amazing');</div>
              <div className="code-line indent"></div>
              <div className="code-line indent"><span>return</span> (</div>
              <div className="code-line indent-2">&lt;div className="app"&gt;</div>
              <div className="code-line indent-3">&lt;h1&gt;Building with Codex is &#123;vibe&#125;!&lt;/h1&gt;</div>
              <div className="code-line indent-2">&lt;/div&gt;</div>
              <div className="code-line indent">);</div>
              <div className="code-line">&#125;</div>
            </div>
          </div>
        </motion.div>

        {/* Features Grid */}
        <div className="features-grid">
          {features.map((feature, index) => (
            <motion.div 
              className="feature-card"
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 + (index * 0.1) }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <div className="feature-icon-wrapper">
                {feature.icon}
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Auth Modal overlay automatically handles its own AnimatePresence */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </div>
  );
}
