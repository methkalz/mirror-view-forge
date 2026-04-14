import SkyfallGame from '@/components/SkyfallGame';
import GameErrorBoundary from '@/components/GameErrorBoundary';

const Index = () => (
  <GameErrorBoundary>
    <SkyfallGame />
  </GameErrorBoundary>
);

export default Index;
