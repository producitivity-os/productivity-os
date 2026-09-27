use app_core::RevisionRating;
use fsrs::{FSRS, MemoryState};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StoredMemoryState {
    pub stability: f32,
    pub difficulty: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScheduleOutcome {
    pub memory: StoredMemoryState,
    pub interval_days: u32,
}

#[derive(Debug, Error)]
pub enum SchedulerError {
    #[error("FSRS scheduling failed: {0}")]
    Fsrs(String),
}

pub struct RevisionScheduler {
    desired_retention: f32,
}

impl Default for RevisionScheduler {
    fn default() -> Self {
        Self {
            desired_retention: 0.9,
        }
    }
}

impl RevisionScheduler {
    pub fn schedule(
        &self,
        previous: Option<StoredMemoryState>,
        elapsed_days: u32,
        rating: RevisionRating,
    ) -> Result<ScheduleOutcome, SchedulerError> {
        let previous = previous.map(|state| MemoryState {
            stability: state.stability,
            difficulty: state.difficulty,
        });
        let states = FSRS::default()
            .next_states(previous, self.desired_retention, elapsed_days)
            .map_err(|error| SchedulerError::Fsrs(error.to_string()))?;
        let next = match rating {
            RevisionRating::Again => states.again,
            RevisionRating::Hard => states.hard,
            RevisionRating::Good => states.good,
            RevisionRating::Easy => states.easy,
        };
        Ok(ScheduleOutcome {
            memory: StoredMemoryState {
                stability: next.memory.stability,
                difficulty: next.memory.difficulty,
            },
            interval_days: next.interval.round().max(1.0) as u32,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_ratings_produce_a_positive_interval() {
        let scheduler = RevisionScheduler::default();
        for rating in [
            RevisionRating::Again,
            RevisionRating::Hard,
            RevisionRating::Good,
            RevisionRating::Easy,
        ] {
            let result = scheduler.schedule(None, 0, rating).unwrap();
            assert!(result.interval_days >= 1);
            assert!(result.memory.stability > 0.0);
        }
    }

    #[test]
    fn easier_ratings_are_not_scheduled_before_harder_ratings() {
        let scheduler = RevisionScheduler::default();
        let again = scheduler.schedule(None, 0, RevisionRating::Again).unwrap();
        let hard = scheduler.schedule(None, 0, RevisionRating::Hard).unwrap();
        let good = scheduler.schedule(None, 0, RevisionRating::Good).unwrap();
        let easy = scheduler.schedule(None, 0, RevisionRating::Easy).unwrap();
        assert!(again.interval_days <= hard.interval_days);
        assert!(hard.interval_days <= good.interval_days);
        assert!(good.interval_days <= easy.interval_days);
    }
}
