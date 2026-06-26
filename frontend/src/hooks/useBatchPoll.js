import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

/**
 * 輪詢批次掃描狀態，直到 status === 'done'。
 * 回傳 { job, error }。
 */
export function useBatchPoll(batchId, intervalMs = 1500) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (!batchId) return undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await api.get('/scan/batch/' + batchId);
        if (cancelled) return;
        setJob(data);
        setError('');
        if (data.status === 'done' && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch (err) {
        // 暫時性錯誤：保留輪詢，僅顯示訊息。
        if (!cancelled) setError(err.message);
      }
    };

    tick();
    timer.current = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [batchId, intervalMs]);

  return { job, error };
}
