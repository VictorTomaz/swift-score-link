import React, { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function DisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accepted = sessionStorage.getItem("disclaimer_accepted");
    if (!accepted) setOpen(true);
  }, []);

  const handleAccept = () => {
    sessionStorage.setItem("disclaimer_accepted", "true");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 'max(80px, env(safe-area-inset-top))',
      paddingLeft: 'max(16px, env(safe-area-inset-left))',
      paddingRight: 'max(16px, env(safe-area-inset-right))',
      backgroundColor: 'rgba(0,0,0,0.6)',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        color: '#0d1f16',
        borderRadius: '16px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        maxWidth: '448px',
        width: '100%',
        padding: '24px',
        maxHeight: '80vh',
        overflowY: 'auto',
        paddingBottom: 'calc(140px + max(0px, env(safe-area-inset-bottom)))',
        colorScheme: 'light',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertTriangle style={{ width: '20px', height: '20px', color: '#d97706' }} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0d1f16', margin: 0 }}>Important Disclaimer</h2>
        </div>

        {/* Body */}
        <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6', marginBottom: '24px' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong style={{ color: '#0d1f16' }}>Swift Score is a golf scoring and payout computation tool only.</strong>
          </p>
          <p style={{ marginBottom: '12px' }}>
            This application is designed solely to calculate and display golf scores and payout distributions based on user-entered data. It does <strong style={{ color: '#0d1f16' }}>not</strong> facilitate, process, or enable any form of gambling, wagering, or financial transactions.
          </p>
          <p style={{ marginBottom: '12px' }}>
            Any dollar amounts shown are for <strong style={{ color: '#0d1f16' }}>informational and computational purposes only</strong>. Users are solely responsible for ensuring their use of this app complies with all applicable local, state, and federal laws and regulations.
          </p>
          <p>By continuing, you acknowledge and agree to this disclaimer.</p>
        </div>

        {/* Button — fully hardcoded, no Tailwind, no CSS variables */}
        <button
          type="button"
          onClick={handleAccept}
          style={{
            display: 'block',
            width: '100%',
            backgroundColor: '#166534',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            padding: '14px 16px',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            colorScheme: 'light',
          }}
        >
          I Understand &amp; Accept
        </button>
      </div>
    </div>
  );
}