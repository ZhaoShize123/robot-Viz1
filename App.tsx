
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Activity, Zap, Timer } from 'lucide-react';
import Robot3D from './components/Robot3D';
import { DynamicsCharts, VelocityChart } from './components/Charts';
import FrictionViz from './components/FrictionViz';
import { calculateInverseDynamics, generateTrajectory, ROBOT_PARAMS, MAX_TORQUES } from './services/dynamics';
import { calculateJointFriction } from './services/frictionModel';
import { generateTimeOptimalTrajectory } from './services/toppra';
import { JointState } from './types';

const MODE_MANUAL = 'MANUAL';
const MODE_AUTO_SINE = 'AUTO_SINE';
const MODE_TOPPRA = 'TOPPRA';

const INITIAL_JOINTS: JointState[] = new Array(6).fill({ angle: 0, velocity: 0, acceleration: 0, torque: 0 });

// Dwell time between TOPP-RA moves in seconds
const DWELL_TIME = 0.5; 

// Safe working limits to avoid "weird" poses or self-collision
// [Min, Max] in radians
// Tightened to "Normal Workspace" to prevent singularities or awkward folds
const SAFE_LIMITS = [
  [-2.0, 2.0],  // J1: Base +/- 115 deg (Avoids extreme rear reach)
  [-1.0, 1.0],  // J2: Shoulder +/- 57 deg (Keeps arm mostly upright/forward)
  [-1.0, 0.5],  // J3: Elbow -57 to +28 deg (Avoids self-collision with base)
  [-2.0, 2.0],  // J4: Wrist 1
  [-1.5, 1.5],  // J5: Wrist 2
  [-3.0, 3.0]   // J6: Wrist 3
];

const App: React.FC = () => {
  const jointsRef = useRef<JointState[]>(INITIAL_JOINTS);
  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  
  // Trajectory state
  const trajectoryRef = useRef<JointState[][]>([]); 
  const trajStartElapsedRef = useRef<number>(0);
  const dwellStartTimeRef = useRef<number | null>(null); 

  const [joints, setJoints] = useState<JointState[]>(INITIAL_JOINTS);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<string>(MODE_MANUAL);
  
  // Updated History state to include velocities
  const [history, setHistory] = useState<{ time: string; torques: number[]; velocities: number[] }[]>([]);
  
  const [isDwelling, setIsDwelling] = useState(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      startTimeRef.current = Date.now() - time * 1000;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

  const planNextToppraMove = () => {
    const current = jointsRef.current;
    
    // Generate random target within SAFE constraints
    // Try to find a target that is at least some distance away to avoid tiny jerky moves
    let target: JointState[] = [];
    let dist = 0;
    let attempts = 0;

    // Increased minimum distance to 2.0 rad to ensure meaningful motion
    while (dist < 2.0 && attempts < 15) {
      target = current.map((j, i) => {
        const [min, max] = SAFE_LIMITS[i];
        const range = max - min;
        // Bias towards center to avoid getting stuck at limits
        const randomAngle = min + Math.random() * range; 
        
        return {
          ...j,
          angle: randomAngle,
          velocity: 0,
          acceleration: 0,
          torque: 0
        };
      });
      
      // Calculate Euclidean distance in Joint Space
      dist = Math.sqrt(target.reduce((acc, t, i) => acc + Math.pow(t.angle - current[i].angle, 2), 0));
      attempts++;
    }
    
    const result = generateTimeOptimalTrajectory(current, target);
    trajectoryRef.current = result.points;
    dwellStartTimeRef.current = null;
    trajStartElapsedRef.current = -1; // Flag to reset on next loop
  };

  const animate = () => {
    if (!isPlayingRef.current) return;
  };

  const modeRef = useRef(mode);
  useEffect(() => { 
    modeRef.current = mode; 
    if (mode === MODE_TOPPRA) {
        setHistory([]);
        planNextToppraMove();
        setIsPlaying(true);
        startTimeRef.current = Date.now();
        trajStartElapsedRef.current = 0;
        dwellStartTimeRef.current = null;
    }
  }, [mode]);

  const loopCallback = useCallback(() => {
    if (!isPlayingRef.current) return;
    
    const now = Date.now();
    let elapsed = (now - startTimeRef.current) / 1000;
    const currentMode = modeRef.current;

    let newJoints: JointState[] | null = null;
    
    if (currentMode === MODE_AUTO_SINE) {
       newJoints = generateTrajectory(elapsed);
       setIsDwelling(false);
    } 
    else if (currentMode === MODE_TOPPRA) {
       // --- TOPP-RA Logic ---
       
       // 1. Initialize start time for new move
       if (trajStartElapsedRef.current < 0) {
         trajStartElapsedRef.current = elapsed;
       }

       // 2. Check Dwell
       if (dwellStartTimeRef.current !== null) {
          setIsDwelling(true);
          if ((now - dwellStartTimeRef.current) / 1000 > DWELL_TIME) {
             planNextToppraMove();
          }
          newJoints = jointsRef.current.map(j => ({...j, velocity: 0, acceleration: 0}));
       } else {
         // 3. Moving State
         setIsDwelling(false);
         
         const moveTime = elapsed - trajStartElapsedRef.current;
         const traj = trajectoryRef.current;

         if (!traj || traj.length === 0) {
            planNextToppraMove();
            return;
         }

         // Find appropriate frame based on absolute time
         // Optimization: Instead of looping, we could use binary search, 
         // but for N=100 array.findIndex is plenty fast enough (microsecond scale).
         const frameIndex = traj.findIndex(frame => (frame as any).time >= moveTime);

         if (frameIndex !== -1) {
            newJoints = traj[frameIndex];
         } else {
            // If findIndex returns -1, we passed the end
            newJoints = traj[traj.length - 1];
            dwellStartTimeRef.current = now; // Start dwell
         }
       }
    }
    else {
       // Manual / Static
       newJoints = jointsRef.current.map(j => ({ ...j, velocity: 0, acceleration: 0 }));
       setIsDwelling(false);
    }

    if (!newJoints) newJoints = jointsRef.current;

    // --- Physics Update ---
    const dynamicsTorques = calculateInverseDynamics(newJoints, ROBOT_PARAMS);
    const frictionTorques = newJoints.map((j, i) => calculateJointFriction(i, j.velocity));
    const totalTorques = dynamicsTorques.map((t, i) => t + frictionTorques[i]);

    const jointsWithTorque = newJoints.map((j, i) => ({
      ...j,
      torque: totalTorques[i]
    }));

    jointsRef.current = jointsWithTorque;
    setJoints(jointsWithTorque);
    setTime(elapsed);

    // Update History (Throttled update for performance)
    if (currentMode !== MODE_MANUAL) {
      setHistory(prev => {
         const newEntry = {
            time: (Date.now() / 1000).toFixed(2),
            torques: dynamicsTorques, // Dynamics only
            velocities: jointsWithTorque.map(j => j.velocity * (180 / Math.PI)) // Deg/s
         };
         // Only add if time diff is significant to prevent chart clutter
         if (prev.length > 0 && parseFloat(newEntry.time) - parseFloat(prev[prev.length-1].time) < 0.05) {
            return prev;
         }
         const newHistory = [...prev, newEntry];
         if (newHistory.length > 100) newHistory.shift();
         return newHistory;
      });
    }

    requestRef.current = requestAnimationFrame(loopCallback);
  }, []);

  const animateRef = useRef(loopCallback);
  useEffect(() => { animateRef.current = loopCallback; }, [loopCallback]);
  const tick = () => { animateRef.current(); };

  useEffect(() => {
    if (isPlaying) requestRef.current = requestAnimationFrame(tick);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying]);

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col h-screen overflow-hidden">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
            <Activity className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">RoboDynamics <span className="text-orange-500">Viz</span></h1>
            <p className="text-xs text-slate-400">Industrial Manipulator Dynamics Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {/* Mode Select */}
           <div className="flex bg-slate-700 rounded-md p-1 gap-1">
              <button 
                onClick={() => handleModeChange(MODE_MANUAL)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === MODE_MANUAL ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Static
              </button>
              <button 
                 onClick={() => handleModeChange(MODE_AUTO_SINE)}
                 className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === MODE_AUTO_SINE ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Sine Wave
              </button>
              <button 
                 onClick={() => handleModeChange(MODE_TOPPRA)}
                 className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === MODE_TOPPRA ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Zap size={14} />
                TOPP-RA Opt
              </button>
           </div>
           
           <button 
             onClick={() => setIsPlaying(!isPlaying)}
             className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white transition-all border border-slate-600"
             title={isPlaying ? "Pause" : "Play"}
           >
             {isPlaying ? <Pause size={18} /> : <Play size={18} />}
           </button>
           
           <button 
             onClick={() => { setHistory([]); setTime(0); }}
             className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white transition-all border border-slate-600"
             title={isPlaying ? "Pause" : "Play"}
           >
             <RefreshCw size={18} />
           </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left: 3D View */}
        <div className="lg:col-span-7 flex flex-col gap-4 relative">
          <div className="flex-1 min-h-0 relative">
             <Robot3D joints={joints} />
             
             {/* Status Indicator for TOPP-RA */}
             {mode === MODE_TOPPRA && (
                <div className="absolute top-4 right-4 pointer-events-none">
                   {isDwelling ? (
                      <span className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded text-xs font-mono text-slate-300 border border-slate-600">
                        <Timer size={12} className="animate-pulse" /> NEXT MOVE...
                      </span>
                   ) : (
                      <span className="flex items-center gap-2 bg-cyan-900/80 px-3 py-1 rounded text-xs font-mono text-cyan-300 border border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                        <Zap size={12} fill="currentColor" /> PHASE PLANE OPT
                      </span>
                   )}
                </div>
             )}
             
             {/* Bottom Overlay: Velocity Graph */}
             <div className="absolute bottom-4 left-4 right-4 h-48 pointer-events-none">
                 <VelocityChart history={history} />
             </div>
          </div>
        </div>

        {/* Right: Charts */}
        <div className="lg:col-span-5 flex flex-col gap-6 h-full overflow-y-auto pr-2">
           <div className="h-[45%] min-h-[250px]">
              <DynamicsCharts history={history} currentJoints={joints} />
           </div>
           <div className="flex-1 min-h-[300px]">
              <FrictionViz currentJoints={joints} />
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
