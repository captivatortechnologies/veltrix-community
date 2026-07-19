import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../../services/authService';
import logoSvg from '../../assets/logo.svg';
import { useBrand } from '../../brand';

/**
 * Self-service "forgot password" — step 1. Collects an email and asks the server
 * to send a reset link. The server responds identically whether or not the
 * account exists, so this page always shows the same generic confirmation (no
 * account enumeration).
 */
const ForgotPasswordPage: React.FC = () => {
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const msg = await requestPasswordReset(email);
      setMessage(msg);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
        <div className="text-center">
          <img src={logoSvg} alt={`${brand.name} logo`} className="h-10 w-auto mx-auto mb-1" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">Reset your password</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your email and we'll send you a link to reset it.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded" role="alert">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {submitted ? (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 text-green-800 dark:text-green-300 p-4 rounded flex items-start" role="status">
              <MailCheck className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{message}</p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Didn't get an email? Check your spam folder, or{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                try again
              </button>
              .
            </p>
            <div className="text-center">
              <Link to="/login" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400">
                <ArrowLeft size={16} className="mr-1" /> Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="absolute right-3 inset-y-0 flex items-center">
                  <ArrowRight size={20} className="h-5 w-5 text-blue-300 group-hover:text-blue-200" />
                </span>
                {isLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>

            <div className="text-center">
              <Link to="/login" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400">
                <ArrowLeft size={16} className="mr-1" /> Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
