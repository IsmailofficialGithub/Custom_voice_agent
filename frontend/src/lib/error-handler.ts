// User-Friendly Error Translator
// Maps raw technical HTTP / WebSocket / JS exceptions to intuitive, actionable user messages

export interface UserFriendlyError {
  title: string;
  message: string;
  actionableHint?: string;
  statusCode?: number;
}

export function parseUserFriendlyError(error: unknown, contextLabel = 'Operation'): UserFriendlyError {
  if (!error) {
    return {
      title: `${contextLabel} Failed`,
      message: 'An unexpected error occurred. Please try again.',
      actionableHint: 'Check your connection or refresh the page.',
    };
  }

  // Handle standard HTTP / Fetch / Axios errors
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { status?: number; statusCode?: number; message?: string; code?: string };
    const status = errObj.status || errObj.statusCode;

    if (status === 401) {
      return {
        title: 'Authentication Required',
        message: 'Your secret API key is missing or invalid.',
        actionableHint: 'Click "API Keys" in the top bar to verify your developer key.',
        statusCode: 401,
      };
    }

    if (status === 403) {
      return {
        title: 'Access Restricted',
        message: 'You do not have permission to perform this action with your current user role.',
        actionableHint: 'Switch to an Administrator or Developer role in the user menu.',
        statusCode: 403,
      };
    }

    if (status === 404) {
      return {
        title: 'Resource Not Found',
        message: 'The requested agent, session, or document could not be located.',
        actionableHint: 'It may have been deleted by another user.',
        statusCode: 404,
      };
    }

    if (status === 500 || status === 503) {
      return {
        title: 'Backend Service Unavailable',
        message: 'The AI orchestration engine or LLM provider experienced an issue.',
        actionableHint: 'Verify that NestJS backend (port 3000) and PostgreSQL are running.',
        statusCode: status,
      };
    }

    // Network / Connection Error
    if (errObj.code === 'ECONNREFUSED' || errObj.message?.includes('fetch failed')) {
      return {
        title: 'Backend Server Unreachable',
        message: 'Unable to establish HTTP connection to http://localhost:3000/api/v1.',
        actionableHint: 'Ensure your backend NestJS process is active.',
      };
    }

    if (errObj.message) {
      return {
        title: `${contextLabel} Notice`,
        message: errObj.message,
        actionableHint: 'Please review your input and try again.',
      };
    }
  }

  if (typeof error === 'string') {
    return {
      title: `${contextLabel} Alert`,
      message: error,
    };
  }

  return {
    title: `${contextLabel} Failed`,
    message: String(error),
    actionableHint: 'If this issue persists, contact system support.',
  };
}
