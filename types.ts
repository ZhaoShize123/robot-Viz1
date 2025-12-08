export interface JointState {
  angle: number;      // radians
  velocity: number;   // rad/s
  acceleration: number; // rad/s^2
  torque: number;     // Nm
}

export interface RobotState {
  joints: JointState[];
  timestamp: number;
}

export interface DynamicsParams {
  masses: number[]; // Mass of each link (kg)
  lengths: number[]; // Length of each link (m)
  com: number[]; // Center of mass distance from prev joint
}

export enum SimulationMode {
  MANUAL = 'MANUAL',
  AUTO_SINE = 'AUTO_SINE',
  GRAVITY_ONLY = 'GRAVITY_ONLY'
}
