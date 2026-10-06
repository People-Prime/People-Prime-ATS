"""
Abstract Base Adapter Interface for Job Board Integrations.
Ensures zero coupling between job boards and core ATS.
"""
from abc import ABC, abstractmethod

class BaseJobBoardAdapter(ABC):
    @abstractmethod
    def publish_job(self, job_posting):
        """Publish or update a job posting on the external board."""
        pass

    @abstractmethod
    def close_job(self, job_posting):
        """Expire or close a job posting on the external board."""
        pass

    @abstractmethod
    def process_incoming_candidate(self, payload):
        """Process and map candidate application payload into ATS CareerPortalApplicant."""
        pass
