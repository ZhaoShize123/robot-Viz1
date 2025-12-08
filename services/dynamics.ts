import { JointState, DynamicsParams } from '../types';

// Constants for a generic 6-DOF Industrial Robot (Approximating an ABB IRB 120 style)
export const ROBOT_PARAMS: DynamicsParams = {
  masses: [5, 8, 6, 2, 1, 0.5], // kg
  lengths: [0.29, 0.27, 0.30, 0.10, 0.05, 0.05], // meters
  com: [0.15, 0.13, 0.15, 0.05, 0.02, 0.01] // Center of mass roughly half link length
};

// Realistic Torque Limits for a small/medium industrial robot (Nm)
// Reduced from 200 to 80 to ensure Friction (calculated as % of this) is not excessively large.
export const MAX_TORQUES = [80, 80, 40, 20, 10, 10]; 

const G = 9.81;

export const calculateGravityTorques = (
  joints: JointState[], 
  params: DynamicsParams
): number[] => {
  const torques: number[] = new Array(6).fill(0);
  const q = joints.map(j => j.angle);

  // Joint 2 (Shoulder) - Lifts Link 2, 3, 4, 5, 6
  // Effective lever arm depends on Cos(q2)
  const m2_eff = params.masses[1] + params.masses[2] + params.masses[3]; 
  torques[1] += m2_eff * G * params.com[1] * Math.cos(q[1]);

  // Joint 3 (Elbow) - Lifts Link 3, 4, 5, 6. Depends on q2 + q3
  const m3_eff = params.masses[2] + params.masses[3];
  torques[2] += m3_eff * G * params.com[2] * Math.cos(q[1] + q[2]);

  // Joint 5 (Wrist Pitch)
  torques[4] += params.masses[4] * G * params.com[4] * Math.cos(q[1] + q[2] + q[4]);
  
  return torques;
};

/**
 * A highly simplified Inverse Dynamics calculation for visualization purposes.
 * Real industrial dynamics require full Recursive Newton-Euler Algorithm (RNEA) 
 * with accurate inertia tensors. This simulates the *effects* of gravity, 
 * coriolis/centrifugal forces, and inertia.
 */
export const calculateInverseDynamics = (
  joints: JointState[], 
  params: DynamicsParams
): number[] => {
  // Start with gravity
  const torques = calculateGravityTorques(joints, params);
  
  // Extract states
  const q = joints.map(j => j.angle);
  const qd = joints.map(j => j.velocity);
  const qdd = joints.map(j => j.acceleration);

  // Simplified equations of motion: Tau = M(q)qdd + C(q,qd)qd + G(q)
  
  // --- Gravity Term (G) ---
  // Already calculated in `torques`

  // --- Inertia Term (M * qdd) ---
  // F = ma -> T = I * alpha
  for (let i = 0; i < 6; i++) {
    // Approximate Inertia (I = m * r^2)
    const inertia = params.masses[i] * Math.pow(params.lengths[i], 2); 
    // Add coupling effects (simplification: base carries more inertia)
    const coupling = (5 - i) * 0.5; 
    torques[i] += (inertia + coupling) * qdd[i];
  }

  // --- Coriolis/Centrifugal (C * qd^2) ---
  // Force depends on velocity squared.
  for (let i = 0; i < 6; i++) {
    // Neural Friction is handled in App.tsx now. We only calculate dynamic forces here.
    const centrifugal = 0.1 * qd[i] * Math.abs(qd[i]); // Aerodynamic/Centrifugal drag approx
    torques[i] += centrifugal;
  }

  // Joint 1 (Base) usually fights no gravity (vertical axis), only inertia
  torques[0] = (params.masses.reduce((a,b) => a+b, 0) * 0.1) * qdd[0];

  return torques;
};

// Generate a smooth trajectory point
export const generateTrajectory = (time: number): JointState[] => {
  const joints: JointState[] = [];
  
  // Adjusted frequencies and amplitudes to ensure max velocity < 150 deg/s (~2.61 rad/s) for all joints
  // Max Vel = Amplitude * 2 * PI * Frequency
  // J1: 1.5 * 2pi * 0.1 = 0.94 rad/s (54 deg/s)
  // J2: 0.5 * 2pi * 0.05 = 0.16 rad/s (9 deg/s)
  // J3: 0.8 * 2pi * 0.08 = 0.40 rad/s (23 deg/s)
  // J4: 1.5 * 2pi * 0.15 = 1.41 rad/s (81 deg/s)
  // J5: 1.0 * 2pi * 0.12 = 0.75 rad/s (43 deg/s)
  // J6: 2.0 * 2pi * 0.20 = 2.51 rad/s (144 deg/s) < 150 limit
  
  const freqs = [0.1, 0.05, 0.08, 0.15, 0.12, 0.2];
  const amps = [1.5, 0.5, 0.8, 1.5, 1.0, 2.0];
  const phases = [0, 0.5, 1.0, 0, 0.5, 0];

  for (let i = 0; i < 6; i++) {
    const omega = 2 * Math.PI * freqs[i];
    
    // Position: A * sin(wt + phi)
    const angle = amps[i] * Math.sin(omega * time + phases[i]);
    
    // Velocity: A * w * cos(wt + phi)
    const velocity = amps[i] * omega * Math.cos(omega * time + phases[i]);
    
    // Acceleration: -A * w^2 * sin(wt + phi)
    const acceleration = -amps[i] * Math.pow(omega, 2) * Math.sin(omega * time + phases[i]);

    joints.push({ angle, velocity, acceleration, torque: 0 });
  }

  return joints;
};