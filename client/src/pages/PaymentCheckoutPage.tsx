import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransactionDetail, createRazorpayOrder, verifyRazorpayPayment } from '../api';
import type { Transaction } from '../api';
import { CreditCard, CheckCircle2, AlertCircle, ArrowLeft, Shield } from 'lucide-react';

declare global {
  interface Window { Razorpay: any; }
}

export default function PaymentCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    getTransactionDetail(id)
      .then(setTxn)
      .catch(() => setErrorMsg('Failed to load transaction details'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const handlePayment = async () => {
    if (!txn) return;
    setProcessing(true);
    setErrorMsg('');

    try {
      const order = await createRazorpayOrder({ amount: txn.amount * 100, transactionId: txn.id });
      if (!order.success) throw new Error('Failed to create order');

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'Revenue Recovery',
        description: 'Recovery Payment',
        order_id: order.order_id,
        prefill: {
          name: txn.customer?.name,
          email: txn.customer?.email,
          contact: txn.customer?.phone || '',
        },
        theme: { color: '#7c3aed' },
        handler: async function (response: any) {
          try {
            setProcessing(true);
            const verifyRes = await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              transactionId: txn.id,
            });
            setPaymentStatus(verifyRes.success ? 'success' : 'failed');
            if (!verifyRes.success) setErrorMsg('Payment verification failed.');
          } catch {
            setPaymentStatus('failed');
            setErrorMsg('Failed to verify payment on server.');
          } finally {
            setProcessing(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setProcessing(false);
        setPaymentStatus('failed');
        setErrorMsg(response.error.description || 'Payment failed');
      });
      rzp.open();
    } catch (e: any) {
      setProcessing(false);
      setPaymentStatus('failed');
      setErrorMsg(e.message || 'Something went wrong');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050510]">
        <div className="text-center text-[#8b8baf]">
          <div className="inline-block w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-3" />
          <div className="text-sm">Loading secure checkout...</div>
        </div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050510] text-red-400">
        Transaction not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050510] text-[#f0f0ff] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0d0d1f] border border-violet-500/20 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-violet-700 to-pink-600 p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-black/20" />
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 shadow-lg border border-white/30">
              <CreditCard size={30} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white font-space mb-1">Complete Payment</h1>
            <div className="flex items-center gap-1.5 text-white/75 text-sm">
              <Shield size={13} />
              Secure checkout powered by Razorpay
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {paymentStatus === 'success' ? (
            <div className="text-center py-4 animate-slide-up">
              <CheckCircle2 size={60} className="text-emerald-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2 text-[#f0f0ff]">Payment Successful!</h2>
              <p className="text-[#8b8baf] mb-8 text-sm leading-relaxed">
                Thank you. Your transaction has been recovered successfully.
              </p>
              <button
                onClick={() => navigate('/transactions')}
                className="bg-[#12122a] border border-violet-500/20 text-[#f0f0ff] px-6 py-3 rounded-xl font-semibold w-full hover:bg-violet-500/10 transition-colors"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Amount block */}
              <div className="bg-[#050510]/60 border border-violet-500/15 rounded-xl p-5 mb-6">
                <div className="text-xs text-[#8b8baf] uppercase tracking-widest mb-1 font-semibold">
                  Amount Due
                </div>
                <div className="text-4xl font-extrabold font-space text-violet-400 mb-4">
                  {fmt(txn.amount)}
                </div>

                <div className="flex justify-between items-center py-3 border-t border-violet-500/10">
                  <span className="text-sm text-[#8b8baf]">Customer Name</span>
                  <span className="text-sm font-semibold text-[#f0f0ff]">{txn.customer?.name}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-t border-violet-500/10">
                  <span className="text-sm text-[#8b8baf]">Transaction Ref</span>
                  <span className="text-sm font-mono text-[#8b8baf]">{txn.id.slice(0, 8)}…</span>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-5">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <p className="text-sm">{errorMsg}</p>
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={processing}
                className="bg-gradient-to-br from-violet-600 to-purple-800 text-white px-6 py-4 rounded-xl font-bold w-full flex items-center justify-center gap-2 transition-all duration-300 hover:from-violet-500 hover:to-purple-700 hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(124,58,237,0.4)] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Securely...
                  </>
                ) : (
                  <>
                    <CreditCard size={17} />
                    Pay {fmt(txn.amount)} Now
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {!processing && paymentStatus !== 'success' && (
        <button
          onClick={() => navigate(`/transactions/${id}`)}
          className="mt-5 flex items-center gap-2 text-[#8b8baf] text-sm hover:text-[#f0f0ff] transition-colors group"
        >
          <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-1" />
          Return to details
        </button>
      )}
    </div>
  );
}
