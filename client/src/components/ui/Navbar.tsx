import { useState, useRef, useEffect } from 'react';
import { Bell, User, Sun, Moon, ChevronDown, LogOut } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { isAuthenticated, logout, getUser } from '../../services/authService';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  // Create ref for user dropdown
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Handle logout
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <nav className="bg-slate-800 dark:bg-slate-900 shadow-lg h-16 flex items-center px-6">
      <div className="flex-1"></div>
      
      {/* User actions */}
      <div className="flex items-center space-x-4">
        {/* Theme toggle */}
        <button 
          onClick={toggleTheme}
          className="text-gray-300 hover:text-white p-1 rounded-full" 
          aria-label="Toggle theme"
        >
          {isDarkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>
        
        {authenticated ? (
          <>
            <button className="text-gray-300 hover:text-white">
              <Bell className="h-5 w-5" />
            </button>
            
            {/* User profile dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="text-gray-300 hover:text-white flex items-center"
              >
                <User className="h-5 w-5" />
                <span className="ml-2 text-sm">{getUser()?.name || 'User'}</span>
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform duration-200 ${isUserMenuOpen ? 'transform rotate-180' : ''}`} />
              </button>
              
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 z-50">
                  <a
                    href="/profile"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <User className="h-4 w-4 mr-2" />
                    My Profile
                  </a>
                  <hr className="my-1 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <a 
            href="/login"
            className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
          >
            Login
          </a>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
