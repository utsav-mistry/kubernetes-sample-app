import { useEffect, useState } from 'react';
import { api } from './api';

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [health, setHealth] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadStatus() {
    const [healthResponse, dbResponse] = await Promise.all([
      api.get('/api/health'),
      api.get('/api/db-check')
    ]);

    setHealth(healthResponse.data);
    setDbStatus(dbResponse.data);
  }

  async function loadTasks() {
    const response = await api.get('/api/tasks');
    setTasks(response.data);
  }

  async function refreshData() {
    setError('');
    setLoading(true);

    try {
      await Promise.all([loadStatus(), loadTasks()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load application data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await api.post('/api/tasks', { title: trimmedTitle });
      setTasks((currentTasks) => [response.data, ...currentTasks]);
      setTitle('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to add task');
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(id) {
    setError('');

    try {
      const response = await api.patch(`/api/tasks/${id}/toggle`);
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === id ? response.data : task))
      );
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to update task');
    }
  }

  async function deleteTask(id) {
    setError('');

    try {
      await api.delete(`/api/tasks/${id}`);
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== id));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to delete task');
    }
  }

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">DevOps Practice App</p>
          <h1>Task Manager</h1>
        </div>
        <div className="status-group">
          <span className="status-pill">API: {health?.status || 'checking'}</span>
          <span className="status-pill">DB: {dbStatus?.database || 'checking'}</span>
        </div>
      </section>

      <form className="task-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a new task"
          aria-label="Task title"
        />
        <button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Adding...' : 'Add Task'}
        </button>
      </form>

      {error && <p className="error-message">{error}</p>}

      <section className="task-panel">
        <div className="task-panel-header">
          <h2>Tasks</h2>
          <button type="button" className="secondary-button" onClick={refreshData}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">No tasks yet.</p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className="task-item">
                <label className="task-label">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                  />
                  <span className={task.completed ? 'completed' : ''}>{task.title}</span>
                </label>
                <button type="button" className="delete-button" onClick={() => deleteTask(task.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;

