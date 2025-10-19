// DynamicIsland.tsx - Container for message and voice pills in titlebar
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../../stores/useUIStore';
import MessagePill from './MessagePill';
import VoicePill from './VoicePill';

const MAX_PILLS = 4;

// Smooth spring physics - like gravity pulling to the left
const slideInVariants = {
  initial: {
    opacity: 0,
    x: 300, // Start far right, off-screen
    scale: 0.6,
  },
  animate: {
    opacity: 1,
    x: 0, // Slide all the way to the left
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.7,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

// Bouncy spring config - feels like a ball rolling and hitting a wall
const springConfig = {
  type: 'spring' as const,
  stiffness: 260, // How tight the spring is
  damping: 20,    // Bounciness (lower = more bounce)
  mass: 1.2,      // Weight (higher = more momentum)
};

export function DynamicIsland() {
  const messagePills = useUIStore((state) => state.dynamicIsland.messagePills);
  const voicePills = useUIStore((state) => state.dynamicIsland.voicePills);
  const selectedVoicePillId = useUIStore((state) => state.dynamicIsland.selectedVoicePillId);

  // Combine and limit total pills to MAX_PILLS
  // Voice pills take priority over message pills
  const totalVoicePills = voicePills.length;
  const availableSlots = Math.max(0, MAX_PILLS - totalVoicePills);
  const displayedMessagePills = messagePills.slice(0, availableSlots);

  return (
    <div
      className="flex items-center gap-2 px-2"
      data-no-drag
    >
      <AnimatePresence mode="popLayout">
        {/* Voice Pills - always shown first, slide from right to left */}
        {voicePills.map((pill, index) => (
          <motion.div
            key={pill.id}
            layout="position"
            variants={slideInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ willChange: 'transform, opacity' }}
            transition={{
              ...springConfig,
              delay: index * 0.05, // Slight stagger for multiple pills
              layout: {
                type: 'spring',
                stiffness: 300,
                damping: 25,
              },
            }}
          >
            <VoicePill
              pill={pill}
              isSelected={pill.id === selectedVoicePillId}
            />
          </motion.div>
        ))}

        {/* Message Pills - shown after voice pills, same gravity effect */}
        {displayedMessagePills.map((pill, index) => (
          <motion.div
            key={pill.id}
            layout="position"
            variants={slideInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ willChange: 'transform, opacity' }}
            transition={{
              ...springConfig,
              delay: (voicePills.length + index) * 0.05, // Stagger after voice pills
              layout: {
                type: 'spring',
                stiffness: 300,
                damping: 25,
              },
            }}
          >
            <MessagePill pill={pill} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
