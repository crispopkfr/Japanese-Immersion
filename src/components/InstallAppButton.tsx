import React from 'react';

interface InstallAppButtonProps {
  className?: string;
  variant?: 'button' | 'menuItem' | 'compact';
}

export function InstallAppButton({ className = '', variant = 'button' }: InstallAppButtonProps) {
  // Unconditionally hidden per user preference
  return null;
}

