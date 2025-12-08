import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { JointState } from '../types';
import * as THREE from 'three';

// ABB Orange color
const ROBOT_COLOR = "#ff9e00";
const METAL_COLOR = "#2d3748";

interface RobotProps {
  joints: JointState[];
}

const ArmSegment = ({ 
  length, 
  width = 0.1, 
  color = ROBOT_COLOR, 
  children, 
  rotation = [0, 0, 0],
  position = [0, 0, 0]
}: any) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Visual Mesh for the Link */}
      <mesh position={[0, length / 2, 0]}>
        <boxGeometry args={[width, length, width]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Joint Cylinder (Visual) */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]}>
        <cylinderGeometry args={[width * 0.8, width * 0.8, width * 1.4, 32]} />
        <meshStandardMaterial color={METAL_COLOR} />
      </mesh>
      {/* Next Link Attachment Point */}
      <group position={[0, length, 0]}>
        {children}
      </group>
    </group>
  );
};

const RobotModel: React.FC<RobotProps> = ({ joints }) => {
  const angles = joints.map(j => j.angle);

  return (
    <group position={[0, 0, 0]}>
      {/* Base Pedestal */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.2, 32]} />
        <meshStandardMaterial color={METAL_COLOR} />
      </mesh>

      {/* Joint 1: Base Rotation (Rotate around Y) */}
      <group position={[0, 0.2, 0]} rotation={[0, -angles[0], 0]}>
         {/* Link 1 Mesh */}
         <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.2, 32]} />
            <meshStandardMaterial color={ROBOT_COLOR} />
         </mesh>

         {/* Joint 2: Shoulder (Rotate around X) */}
         <group position={[0, 0.2, 0]} rotation={[angles[1], 0, 0]}>
            {/* Link 2: Upper Arm */}
            <ArmSegment length={0.4} width={0.12} position={[0, 0, 0]}>
              
              {/* Joint 3: Elbow (Rotate around X) */}
              <group rotation={[angles[2], 0, 0]}>
                 {/* Link 3: Forearm + balance weight look */}
                 <group position={[0, 0, 0]}>
                    <mesh position={[0, -0.05, -0.05]}> 
                      <boxGeometry args={[0.1, 0.15, 0.15]} /> 
                      <meshStandardMaterial color={ROBOT_COLOR} />
                    </mesh>
                 </group>

                 <ArmSegment length={0.35} width={0.09}>
                    
                    {/* Joint 4: Wrist 1 (Rotate around Z - Axis along arm) */}
                    <group rotation={[0, 0, angles[3]]}>
                       <ArmSegment length={0.2} width={0.07} color={METAL_COLOR}>
                          
                          {/* Joint 5: Wrist 2 (Rotate around X) */}
                          <group rotation={[angles[4], 0, 0]}>
                             <ArmSegment length={0.1} width={0.06}>
                                
                                {/* Joint 6: Wrist 3 (Rotate around Z) */}
                                <group rotation={[0, 0, angles[5]]}>
                                   {/* Flange / Tool */}
                                   <mesh position={[0, 0.05, 0]}>
                                      <cylinderGeometry args={[0.05, 0.05, 0.02, 32]} />
                                      <meshStandardMaterial color="#888" />
                                   </mesh>
                                   <mesh position={[0, 0.08, 0]}>
                                      <boxGeometry args={[0.02, 0.06, 0.02]} />
                                      <meshStandardMaterial color="#333" />
                                   </mesh>
                                </group>
                             </ArmSegment>
                          </group>
                       </ArmSegment>
                    </group>
                 </ArmSegment>
              </group>
            </ArmSegment>
         </group>
      </group>
    </group>
  );
};

const Robot3D: React.FC<RobotProps> = ({ joints }) => {
  return (
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden shadow-xl border border-slate-700">
      <Canvas shadows camera={{ position: [1.5, 1.5, 1.5], fov: 45 }}>
        <color attach="background" args={['#1e293b']} />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
        
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[2, 5, 2]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]} 
        />
        <Environment preset="city" />

        {/* Scene */}
        <RobotModel joints={joints} />
        
        {/* Floor */}
        <Grid position={[0, 0, 0]} args={[10, 10]} cellColor="#475569" sectionColor="#64748b" fadeDistance={10} />
        <ContactShadows opacity={0.5} scale={10} blur={1.5} far={1} resolution={256} color="#000000" />
      </Canvas>
      <div className="absolute top-4 left-4 pointer-events-none">
        <h2 className="text-white/80 font-mono text-sm font-bold bg-slate-800/80 px-2 py-1 rounded">IRB-Sim 6-DOF</h2>
      </div>
    </div>
  );
};

export default Robot3D;