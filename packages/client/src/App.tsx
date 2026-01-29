import { toast } from 'sonner';
import { ModeToggle } from './components/theme/mode-toggle';
import { Button } from './components/ui/button';

const App = () => {
  return (
    <div className="flex justify-center items-center h-screen gap-2">
      <ModeToggle />
      <Button onClick={() => toast('Hello', { position: 'bottom-right' })}>Click Me</Button>
    </div>
  );
};

export default App;
