import { JointState } from '../types';
import { calculateInverseDynamics, calculateGravityTorques, MAX_TORQUES, ROBOT_PARAMS } from './dynamics';
import { calculateJointFriction } from './frictionModel';

/**
 * Robust TOPP-RA Implementation (Time-Optimal Path Parameterization)
 * 
 * Strategy:
 * 1. Discretize path into N steps of scalar 's' [0, 1].
 * 2. Dynamics projection: tau = A(s)*s_ddot + B(s)*s_dot^2 + C(s) + Friction.
 * 3. Pass 1: Compute Maximum Velocity Curve (MVC) based on static constraints (Gravity vs Max Torque).
 * 4. Pass 2: Backward Pass (Integration) to satisfy deceleration limits from the end.
 * 5. Pass 3: Forward Pass (Raw Acceleration Calculation).
 * 6. Post-Process: Smooth Acceleration profile to remove torque chatter/jitter.
 * 7. Pass 4: Final Integration to time-domain.
 */

const N_GRID = 200; // Increased resolution for smoother derivatives
const PLAYBACK_SPEED_FACTOR = 1.0; // Speed multiplier (1.0 = Real-time physical speed)

// Helper: Linear Fallback if solver fails (Safety net)
const generateLinearFallback = (start: JointState[], end: JointState[]) => {
  const points: JointState[][] = [];
  const duration = 3.0;
  const steps = 60;
  for(let i=0; i<=steps; i++) {
    const t = i / steps;
    const frame = start.map((j, idx) => ({
      angle: j.angle + (end[idx].angle - j.angle) * t,
      velocity: 0,
      acceleration: 0,
      torque: 0
    }));
    (frame as any).time = t * duration; // Absolute timestamp
    points.push(frame);
  }
  return { points, duration };
};

export const generateTimeOptimalTrajectory = (
  startJoints: JointState[],
  endJoints: JointState[],
): { points: JointState[][], duration: number } => {
  
  try {
    const startq = startJoints.map(j => j.angle);
    const endq = endJoints.map(j => j.angle);
    const deltaq = endq.map((e, i) => e - startq[i]);

    // Check for zero movement
    const dist = Math.sqrt(deltaq.reduce((a, b) => a + b*b, 0));
    if (dist < 0.001) return generateLinearFallback(startJoints, endJoints);

    // --- 1. Pre-calculate Dynamics Coefficients over Grid ---
    const A_coeffs: number[][] = []; // Inertia
    const B_coeffs: number[][] = []; // Coriolis/Centrifugal
    const C_coeffs: number[][] = []; // Gravity
    
    // We compute these for discrete s from 0 to 1
    for (let k = 0; k <= N_GRID; k++) {
      const s = k / N_GRID;
      const q_curr = startq.map((val, i) => val + s * deltaq[i]);

      // 1. Gravity Term C(s) -> qd=0, qdd=0
      const statePos = q_curr.map(a => ({ angle: a, velocity: 0, acceleration: 0, torque: 0 }));
      const C = calculateGravityTorques(statePos, ROBOT_PARAMS);
      C_coeffs.push(C);

      // 2. Inertia Term A(s) -> M * deltaq
      // We simulate qdd = deltaq. Tau = M*deltaq + G. So A = Tau - G.
      const stateAcc = q_curr.map((a, i) => ({ angle: a, velocity: 0, acceleration: deltaq[i], torque: 0 }));
      const tau_acc = calculateInverseDynamics(stateAcc, ROBOT_PARAMS);
      const A = tau_acc.map((t, i) => t - C[i]);
      A_coeffs.push(A);

      // 3. Velocity Term B(s) -> C * deltaq^2
      // We simulate qd = deltaq. Tau = C(q, deltaq)*deltaq + G. So B = Tau - G.
      const stateVel = q_curr.map((a, i) => ({ angle: a, velocity: deltaq[i], acceleration: 0, torque: 0 }));
      const tau_vel = calculateInverseDynamics(stateVel, ROBOT_PARAMS);
      const B = tau_vel.map((t, i) => t - C[i]);
      B_coeffs.push(B);
    }

    // --- 2. Compute Maximum Velocity Curve (MVC) ---
    // At each point s, find max s_dot such that constraints hold assuming s_ddot = 0 (cruise)
    const s_dot_limit = new Float32Array(N_GRID + 1);
    
    for (let k = 0; k <= N_GRID; k++) {
      let max_sd_sq = Infinity;

      for (let i = 0; i < 6; i++) {
        const b = B_coeffs[k][i];
        const c = C_coeffs[k][i];
        const t_lim = MAX_TORQUES[i];
        
        // Bounds: -T_lim <= b*sd^2 + c <= T_lim
        if (b > 0) {
            const num = t_lim - c;
            if (num < 0) max_sd_sq = 0; 
            else max_sd_sq = Math.min(max_sd_sq, num / b);
        } else if (b < 0) {
             const num = -t_lim - c;
             if (num > 0) max_sd_sq = 0;
             else max_sd_sq = Math.min(max_sd_sq, num / b);
        }
      }
      s_dot_limit[k] = Math.sqrt(Math.max(0, max_sd_sq));
    }
    s_dot_limit[0] = 0;
    s_dot_limit[N_GRID] = 0;

    // --- 3. Integration Helper ---
    const getAccBounds = (k: number, s_dot: number) => {
      let u_min = -Infinity;
      let u_max = Infinity;
      const sd_sq = s_dot * s_dot;

      for (let i = 0; i < 6; i++) {
        const a = A_coeffs[k][i];
        const b = B_coeffs[k][i];
        const c = C_coeffs[k][i];
        
        // Friction term (approximate)
        const vel_i = s_dot * deltaq[i];
        const f = calculateJointFriction(i, vel_i);

        const rigid_part = b * sd_sq + c;
        const total_bias = rigid_part + f;
        
        const t_max = MAX_TORQUES[i];
        const t_min = -MAX_TORQUES[i];

        const lower = t_min - total_bias;
        const upper = t_max - total_bias;

        if (Math.abs(a) < 1e-5) {
          if (lower > 0 || upper < 0) return null; 
        } else if (a > 0) {
          u_min = Math.max(u_min, lower / a);
          u_max = Math.min(u_max, upper / a);
        } else {
          u_min = Math.max(u_min, upper / a);
          u_max = Math.min(u_max, lower / a);
        }
      }

      if (u_min > u_max) return null;
      return { min: u_min, max: u_max };
    };

    // --- 4. Backward Pass ---
    const ds = 1.0 / N_GRID;
    const beta_curve = new Float32Array(N_GRID + 1);
    beta_curve[N_GRID] = 0;

    for (let k = N_GRID - 1; k >= 0; k--) {
      const s_dot_next = Math.min(beta_curve[k+1], s_dot_limit[k+1]);
      const bounds = getAccBounds(k+1, s_dot_next);
      
      if (!bounds) {
        beta_curve[k] = 0;
      } else {
        const sd_sq_curr = s_dot_next*s_dot_next - 2 * bounds.min * ds;
        beta_curve[k] = Math.sqrt(Math.max(0, sd_sq_curr));
        beta_curve[k] = Math.min(beta_curve[k], s_dot_limit[k]);
      }
    }

    // --- 5. Forward Pass (Calculate Raw Accelerations) ---
    const raw_s_ddot = new Float32Array(N_GRID);
    let s_dot_curr = 0;

    for (let k = 0; k < N_GRID; k++) {
      const bounds = getAccBounds(k, s_dot_curr);
      let s_ddot = 0;
      
      if (bounds) {
        // Greedy acceleration
        s_ddot = bounds.max;
        
        // Safety check against Backward Curve
        const max_next_sq = beta_curve[k+1] * beta_curve[k+1];
        const projected_sq = s_dot_curr*s_dot_curr + 2 * s_ddot * ds;
        
        if (projected_sq > max_next_sq) {
          s_ddot = (max_next_sq - s_dot_curr*s_dot_curr) / (2 * ds);
        }
      }
      
      raw_s_ddot[k] = s_ddot;
      
      // Advance s_dot strictly for calculation purposes (will re-integrate later)
      const next_sd_sq = Math.max(0, s_dot_curr*s_dot_curr + 2 * s_ddot * ds);
      s_dot_curr = Math.sqrt(next_sd_sq);
    }

    // --- 6. Smoothing Pass ---
    // Smooth the acceleration profile to prevent torque chatter around zero
    // Increase window size for softer, more fluid motion
    const smooth_s_ddot = new Float32Array(N_GRID);
    const windowSize = 10; // Increased smoothing window

    for (let k = 0; k < N_GRID; k++) {
       let sum = 0;
       let count = 0;
       for (let w = -windowSize; w <= windowSize; w++) {
          const idx = k + w;
          if (idx >= 0 && idx < N_GRID) {
             sum += raw_s_ddot[idx];
             count++;
          }
       }
       let avg = sum / count;

       // Deadband: Kill micro-fluctuations around zero
       if (Math.abs(avg) < 0.5) avg = 0;

       smooth_s_ddot[k] = avg;
    }


    // --- 7. Final Integration (Time Domain) ---
    const points: JointState[][] = [];
    let t_curr = 0;
    s_dot_curr = 0; // Reset for final integration

    // Start Frame
    const startFrame = startq.map((ang) => ({ 
        angle: ang, velocity: 0, acceleration: 0, torque: 0 
    }));
    (startFrame as any).time = 0;
    points.push(startFrame);

    for (let k = 0; k < N_GRID; k++) {
       // Use Smoothed Acceleration
       const s_ddot = smooth_s_ddot[k];
       
       // Calculate Next Velocity based on smoothed acc
       const next_sd_sq = Math.max(0, s_dot_curr*s_dot_curr + 2 * s_ddot * ds);
       const s_dot_next = Math.sqrt(next_sd_sq);
       
       // Time Step
       let dt = 0;
       const v_avg = (s_dot_curr + s_dot_next) / 2;
       if (v_avg > 1e-4) {
         dt = ds / v_avg;
       } else {
         dt = 0.01;
       }

       dt = dt * PLAYBACK_SPEED_FACTOR;
       dt = Math.max(dt, 0.0001); // Prevent singularity

       t_curr += dt;
       s_dot_curr = s_dot_next;

       // Generate Joint States
       const s_next = (k + 1) / N_GRID;
       const frameJoints = startq.map((startAngle, i) => {
         const ang = startAngle + s_next * deltaq[i];
         const vel = s_dot_next * deltaq[i];
         const acc = s_ddot * deltaq[i]; // Use smoothed s_ddot here!
         return { angle: ang, velocity: vel, acceleration: acc, torque: 0 };
       });
       
       (frameJoints as any).time = t_curr;
       points.push(frameJoints);
    }

    return { points, duration: t_curr };

  } catch (error) {
    console.error("TOPP-RA Critical Failure", error);
    return generateLinearFallback(startJoints, endJoints);
  }
};